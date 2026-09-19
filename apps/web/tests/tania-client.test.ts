import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaniaChatClient, TaniaChatError } from '@/lib/tania/api/tania-client';
import { formatSseEvent } from '@/lib/http/sse';
import type { ChatStreamEvent, TaniaChatResponse } from '@tania/types';

const RESPONSE: TaniaChatResponse = {
  message: {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'tania',
    content: 'Halo dunia',
    createdAt: '2026-09-19T10:00:00.000Z',
  },
  intent: { value: 'SEARCH', confidence: 0.8 },
  sources: [],
  actions: [],
  status: {
    state: 'COMPLETED',
    risk: 'INFORMATIONAL',
    trace: [],
    durationMs: 12,
    model: 'tania-mock-v1',
    grounded: false,
  },
};

/** Streams the given events the way the route does, in arbitrary chunk sizes. */
function sseResponse(events: ChatStreamEvent[], chunkSize = 7): Response {
  const payload = events.map(formatSseEvent).join('');
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < payload.length; index += chunkSize) {
        controller.enqueue(encoder.encode(payload.slice(index, index + chunkSize)));
      }
      controller.close();
    },
  });

  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TaniaChatClient.streamChat', () => {
  it('reassembles frames split across chunks and resolves with the final response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          { type: 'accepted', conversationId: 'conv-1', messageId: 'msg-1' },
          { type: 'phase', phase: 'RETRIEVING' },
          { type: 'intent', intent: RESPONSE.intent },
          { type: 'sources', sources: [] },
          { type: 'delta', text: 'Halo ' },
          { type: 'delta', text: 'dunia' },
          { type: 'done', response: RESPONSE },
        ]),
      ),
    );

    const seen = { phases: [] as string[], deltas: [] as string[], conversationId: '' };

    const result = await new TaniaChatClient().streamChat(
      { message: 'halo' },
      {
        onAccepted: (id) => {
          seen.conversationId = id;
        },
        onPhase: (phase) => seen.phases.push(phase),
        onDelta: (text) => seen.deltas.push(text),
      },
    );

    expect(seen.conversationId).toBe('conv-1');
    expect(seen.phases).toEqual(['RETRIEVING']);
    expect(seen.deltas.join('')).toBe('Halo dunia');
    expect(result.message.content).toBe('Halo dunia');
    expect(result.status.state).toBe('COMPLETED');
  });

  it('asks for a stream and never sends client-side history', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      sseResponse([{ type: 'done', response: RESPONSE }]),
    );
    vi.stubGlobal('fetch', spy);

    await new TaniaChatClient().streamChat({ message: 'halo', conversationId: 'conv-1' });

    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect(body).toEqual({ message: 'halo', conversationId: 'conv-1', stream: true });
  });

  it('turns a server error event into a typed failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          { type: 'phase', phase: 'UNDERSTANDING' },
          { type: 'error', code: 'UPSTREAM_UNAVAILABLE', message: 'Penyedia model tidak tersedia.' },
        ]),
      ),
    );

    await expect(new TaniaChatClient().streamChat({ message: 'halo' })).rejects.toMatchObject({
      failure: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });

  it('reports a stream that ends without a result instead of hanging', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([{ type: 'phase', phase: 'COMPOSING' }])));

    await expect(new TaniaChatClient().streamChat({ message: 'halo' })).rejects.toThrow(
      /berakhir sebelum selesai/,
    );
  });

  it('surfaces an HTTP failure envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'BAD_REQUEST', message: '`message` is required.' }, requestId: 'req-9' },
          { status: 400 },
        ),
      ),
    );

    const error = await new TaniaChatClient()
      .streamChat({ message: '' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TaniaChatError);
    expect((error as TaniaChatError).failure).toMatchObject({
      code: 'BAD_REQUEST',
      requestId: 'req-9',
    });
  });

  it('starts a new conversation through the conversations endpoint', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ data: { conversationId: 'conv-2' } }),
    );
    vi.stubGlobal('fetch', spy);

    await expect(new TaniaChatClient().newConversation()).resolves.toBe('conv-2');
    expect(spy.mock.calls[0]?.[0]).toBe('/api/tania/conversations');
  });
});
