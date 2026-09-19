// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaniaChatResponse } from '@tania/types';

/**
 * The chat path, end to end through the component.
 *
 * Mocked at module boundaries rather than at `fetch`: the transport already has
 * its own tests, and what is untested is the part in between — that a delta
 * reaches the screen, that a failure drops the half-streamed answer instead of
 * leaving it looking complete, and that retry resends what was actually asked.
 */

const streamChat = vi.fn();
const newConversation = vi.fn(async () => 'conv-new');

vi.mock('@/lib/tania/api/tania-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tania/api/tania-client')>(
    '@/lib/tania/api/tania-client',
  );

  return {
    ...actual,
    TaniaChatClient: class {
      streamChat = streamChat;
      newConversation = newConversation;
    },
  };
});

vi.mock('next/navigation', () => ({ usePathname: () => '/tania' }));

// The avatar pulls in Three.js through a dynamic import; the chat path does
// not depend on it, and loading it here would test the wrong thing.
vi.mock('@/components/tania', () => ({
  TaniaController: () => <div data-testid="avatar" />,
}));

vi.mock('@/lib/voice/use-voice', () => ({
  useVoice: () => ({
    snapshot: { state: 'IDLE', since: '' },
    supported: false,
    providers: { input: 'mock', output: 'mock' },
    avatar: { cues: [] },
    start: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    say: vi.fn(),
  }),
}));

const { Workspace } = await import('@/components/workspace/workspace');

function reply(overrides: Partial<TaniaChatResponse['message']> = {}): TaniaChatResponse {
  return {
    message: {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'tania',
      content: 'Kinerja produk X stabil.',
      createdAt: '2026-09-19T00:00:00.000Z',
      ...overrides,
    },
    intent: { value: 'ANALYZE', confidence: 0.8 },
    sources: [],
    actions: [],
    status: {
      state: 'COMPLETED',
      risk: 'LOW',
      trace: [],
      toolsUsed: [],
      model: 'mock',
    },
  } as unknown as TaniaChatResponse;
}

beforeEach(() => {
  streamChat.mockReset();
  newConversation.mockClear();
});

describe('sending a message', () => {
  it('shows the question, streams the answer, then settles', async () => {
    // `delay: null`: userEvent otherwise yields to the event loop between
    // keystrokes to mimic human cadence. Under CPU contention each yield can
    // stretch, and a multi-word `type()` then exceeds the 5s timeout — which
    // is how these tests failed once during a parallel build and passed on
    // every rerun. Nothing here asserts typing speed.
    const user = userEvent.setup({ delay: null });

    streamChat.mockImplementation(async (_request: unknown, handlers: Record<string, never>) => {
      const hooks = handlers as unknown as {
        onAccepted?: (id: string) => void;
        onDelta?: (text: string) => void;
      };
      hooks.onAccepted?.('conv-1');
      hooks.onDelta?.('Kinerja produk X ');
      hooks.onDelta?.('stabil.');
      return reply();
    });

    render(<Workspace />);
    await user.type(
      screen.getByLabelText('Pesan untuk TANIA'),
      'Analisa performance product X.{Enter}',
    );

    expect(await screen.findByText('Analisa performance product X.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/Kinerja produk X stabil\./).length).toBeGreaterThan(0));
  });

  it('carries the conversation into the next turn', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => reply());

    render(<Workspace />);
    const box = screen.getByLabelText('Pesan untuk TANIA');

    await user.type(box, 'pertama{Enter}');
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    await user.type(box, 'kedua{Enter}');
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(2));

    // The first turn had no id to continue; the second must reuse it.
    expect(streamChat.mock.calls[0]?.[0]).not.toHaveProperty('conversationId');
    expect(streamChat.mock.calls[1]?.[0]).toMatchObject({ conversationId: 'conv-1' });
  });

  it('sends the surface it was asked from, so the answer has context', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => reply());

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'halo{Enter}');

    await waitFor(() =>
      expect(streamChat.mock.calls[0]?.[0]).toMatchObject({
        context: { surface: '/tania', locale: 'id-ID' },
      }),
    );
  });

  it('refuses to send a second message while one is in flight', async () => {
    const user = userEvent.setup({ delay: null });
    let release: (value: TaniaChatResponse) => void = () => {};
    streamChat.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    render(<Workspace />);
    const box = screen.getByLabelText('Pesan untuk TANIA');
    await user.type(box, 'pertama{Enter}');

    await waitFor(() => expect(box).toBeDisabled());
    expect(streamChat).toHaveBeenCalledTimes(1);

    release(reply());
    await waitFor(() => expect(box).toBeEnabled());
  });
});

describe('when a turn fails', () => {
  it('drops the half-streamed answer instead of leaving it looking complete', async () => {
    const user = userEvent.setup({ delay: null });

    streamChat.mockImplementation(async (_request: unknown, handlers: Record<string, never>) => {
      (handlers as unknown as { onDelta?: (t: string) => void }).onDelta?.('Kinerja produk X');
      throw new Error('koneksi terputus');
    });

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'analisa{Enter}');

    // The user's question stays; the partial answer does not.
    expect(await screen.findByText('analisa')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Kinerja produk X/)).not.toBeInTheDocument());
  });

  it('surfaces the failure and offers to try again', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => {
      throw new Error('koneksi terputus');
    });

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'analisa{Enter}');

    expect(await screen.findByRole('button', { name: /coba lagi/i })).toBeInTheDocument();
  });

  it('retries exactly what was asked', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementationOnce(async () => {
      throw new Error('gagal');
    });
    streamChat.mockImplementation(async () => reply());

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'Analisa performance.{Enter}');

    await user.click(await screen.findByRole('button', { name: /coba lagi/i }));

    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(2));
    expect(streamChat.mock.calls[1]?.[0]).toMatchObject({ message: 'Analisa performance.' });
  });

  it('leaves the field usable after a failure', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => {
      throw new Error('gagal');
    });

    render(<Workspace />);
    const box = screen.getByLabelText('Pesan untuk TANIA');
    await user.type(box, 'analisa{Enter}');

    await waitFor(() => expect(box).toBeEnabled());
  });
});

describe('starting over', () => {
  it('clears the thread and asks for a new conversation', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => reply());

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'pertama{Enter}');
    expect(await screen.findByText('pertama')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /percakapan baru/i }));

    await waitFor(() => expect(screen.queryByText('pertama')).not.toBeInTheDocument());
    expect(newConversation).toHaveBeenCalled();
  });

  it('still clears the thread when the backend cannot mint an id', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => reply());
    newConversation.mockRejectedValueOnce(new Error('backend mati'));

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'pertama{Enter}');
    expect(await screen.findByText('pertama')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /percakapan baru/i }));

    // The first turn assigns an id anyway, so this must not be fatal.
    await waitFor(() => expect(screen.queryByText('pertama')).not.toBeInTheDocument());
  });
});

describe('an empty workspace', () => {
  it('explains what TANIA is for instead of showing a blank panel', () => {
    render(<Workspace />);

    expect(screen.getByText('Mulai percakapan dengan TANIA')).toBeInTheDocument();
    expect(screen.getByText('Belum ada hasil')).toBeInTheDocument();
  });

  it('offers quick actions that send a real question', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => reply());

    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: /Analyze/ }));

    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat.mock.calls[0]?.[0]).toMatchObject({ intent: 'ANALYZE' });
  });
});

describe('an answer that needs a human decision', () => {
  function gated(): TaniaChatResponse {
    const base = reply({ content: 'Workflow siap dijalankan.' });

    return {
      ...base,
      actions: [
        {
          type: 'APPROVAL',
          label: 'Setujui: Workflow Execution',
          detail: 'Aksi mengubah state enterprise; menunggu keputusan manusia.',
          risk: 'HIGH',
          status: 'PENDING',
          approvalId: 'apr-1',
        },
      ],
      status: { ...base.status, state: 'AWAITING_APPROVAL', risk: 'HIGH' },
    } as unknown as TaniaChatResponse;
  }

  it('shows the gate with its risk instead of quietly running', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => gated());

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'jalankan workflow{Enter}');

    expect(await screen.findByText(/Persetujuan diperlukan/)).toBeInTheDocument();
    expect(screen.getAllByText('HIGH').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Setujui/ })).toBeEnabled();
  });

  it('records the decision and stops offering the buttons', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => gated());

    const fetchMock = vi.fn(async () =>
      Response.json({
        data: {
          approval: { id: 'apr-1', status: 'APPROVED', decidedAt: '2026-09-19T00:01:00.000Z' },
          trace: [],
        },
        requestId: 'req-1',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'jalankan workflow{Enter}');
    await user.click(await screen.findByRole('button', { name: /Setujui/ }));

    // Deciding switches to the activity tab on purpose: what a person wants
    // next is to see what the approval set running.
    await waitFor(() => expect(screen.getByText('Jejak eksekusi')).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: /Hasil/ }));

    // The status line is assembled from several nodes, so match on the
    // element's whole text rather than on one text node.
    // Ancestors also contain the text; the paragraph that owns it is the one.
    await waitFor(() =>
      expect(
        screen.getByText(
          (_, element) =>
            element?.tagName === 'P' &&
            (element.textContent?.includes('Status: Disetujui') ?? false),
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Tolak/ })).not.toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/approvals');
    expect(JSON.parse(String(init.body))).toEqual({ approvalId: 'apr-1', decision: 'APPROVED' });

    vi.unstubAllGlobals();
  });

  it('keeps the gate open when the decision cannot be saved', async () => {
    const user = userEvent.setup({ delay: null });
    streamChat.mockImplementation(async () => gated());

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Backend tidak tersedia.' } },
          { status: 503 },
        ),
      ),
    );

    render(<Workspace />);
    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'jalankan workflow{Enter}');
    await user.click(await screen.findByRole('button', { name: /Setujui/ }));

    // A gate that could not be recorded must not look decided.
    expect(await screen.findByText(/Backend tidak tersedia\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Setujui/ })).toBeEnabled();

    vi.unstubAllGlobals();
  });
});
