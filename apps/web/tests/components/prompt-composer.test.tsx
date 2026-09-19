// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VoiceSnapshot } from '@tania/types';
import { PromptComposer } from '@/components/workspace/prompt-composer';

function voice(state: VoiceSnapshot['state'], overrides: Partial<VoiceSnapshot> = {}) {
  return {
    snapshot: { state, since: '', ...overrides } as VoiceSnapshot,
    supported: true,
    start: vi.fn(),
    cancel: vi.fn(),
  };
}

describe('PromptComposer', () => {
  it('sends on Enter and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PromptComposer onSubmit={onSubmit} busy={false} />);

    const box = screen.getByLabelText('Pesan untuk TANIA');
    await user.type(box, 'Analisa performance product X.{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Analisa performance product X.');
    expect(box).toHaveValue('');
  });

  it('adds a line on Shift+Enter instead of sending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PromptComposer onSubmit={onSubmit} busy={false} />);

    const box = screen.getByLabelText('Pesan untuk TANIA');
    await user.type(box, 'baris satu{Shift>}{Enter}{/Shift}baris dua');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('baris satu\nbaris dua');
  });

  it('refuses to send whitespace', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PromptComposer onSubmit={onSubmit} busy={false} />);

    await user.type(screen.getByLabelText('Pesan untuk TANIA'), '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('locks the field while TANIA is working', () => {
    render(<PromptComposer onSubmit={vi.fn()} busy />);

    expect(screen.getByLabelText('Pesan untuk TANIA')).toBeDisabled();
    expect(screen.getByLabelText('Kirim pesan')).toBeDisabled();
  });

  it('counts down the characters left', async () => {
    const user = userEvent.setup();
    render(<PromptComposer onSubmit={vi.fn()} busy={false} />);

    await user.type(screen.getByLabelText('Pesan untuk TANIA'), 'halo');

    expect(screen.getByText('3996 karakter tersisa')).toBeInTheDocument();
  });

  it('shows the microphone as unavailable rather than hiding it', () => {
    render(
      <PromptComposer
        onSubmit={vi.fn()}
        busy={false}
        voice={{ ...voice('IDLE'), supported: false }}
      />,
    );

    // The capability stays visible and honest about being unavailable.
    expect(screen.getByLabelText('Input suara (tidak tersedia di peramban ini)')).toBeDisabled();
  });
});

describe('the microphone control', () => {
  it('starts a spoken turn when idle', async () => {
    const user = userEvent.setup();
    const controls = voice('IDLE');
    render(<PromptComposer onSubmit={vi.fn()} busy={false} voice={controls} />);

    await user.click(screen.getByLabelText('Mulai bicara dengan TANIA'));

    expect(controls.start).toHaveBeenCalled();
    expect(controls.cancel).not.toHaveBeenCalled();
  });

  it('becomes a stop button while anything is happening', async () => {
    const user = userEvent.setup();

    for (const state of ['LISTENING', 'PROCESSING', 'SPEAKING'] as const) {
      const controls = voice(state);
      const { unmount } = render(
        <PromptComposer onSubmit={vi.fn()} busy={false} voice={controls} />,
      );

      // The most important action during a turn is always "stop".
      await user.click(screen.getByRole('button', { pressed: true }));

      expect(controls.cancel, state).toHaveBeenCalled();
      expect(controls.start, state).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('announces what it is doing, for a reader that cannot see the icon', () => {
    render(
      <PromptComposer
        onSubmit={vi.fn()}
        busy={false}
        voice={voice('LISTENING', { partial: 'analisa perfor' })}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('analisa perfor');
    // Polite, not assertive: this changes several times a second.
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the error rather than only turning the button amber', () => {
    render(
      <PromptComposer
        onSubmit={vi.fn()}
        busy={false}
        voice={voice('ERROR', {
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Akses mikrofon ditolak.',
            recoverable: false,
          },
        })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Akses mikrofon ditolak.');
    expect(screen.getByLabelText(/bermasalah/)).toBeEnabled();
  });

  it('says nothing at all when idle', () => {
    render(<PromptComposer onSubmit={vi.fn()} busy={false} voice={voice('IDLE')} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
