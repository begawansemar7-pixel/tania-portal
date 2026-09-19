'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { VoiceSnapshot } from '@tania/types';
import { VoiceButton, VoiceStatus } from './voice-button';

const MAX_LENGTH = 4000;

/**
 * Prompt composer.
 *
 * Enter sends, Shift+Enter adds a line. The microphone runs a full spoken turn:
 * listen, ask, speak. Where no speech engine exists the button stays visible
 * and disabled, so the capability is honest about being unavailable rather than
 * vanishing.
 */
export function PromptComposer({
  onSubmit,
  busy,
  autoFocus = false,
  voice,
}: {
  onSubmit: (message: string) => void;
  busy: boolean;
  autoFocus?: boolean;
  voice?: {
    snapshot: VoiceSnapshot;
    supported: boolean;
    start: () => void;
    cancel: () => void;
  };
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  function send() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    setValue('');
    onSubmit(trimmed);
  }

  const remaining = MAX_LENGTH - value.length;

  return (
    <form
      className="border-t border-line bg-surface px-4 py-3 sm:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-slate-50 px-3 py-2 focus-within:border-brand focus-within:bg-surface">
        <label htmlFor="prompt-composer" className="sr-only">
          Pesan untuk TANIA
        </label>
        <textarea
          id="prompt-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          disabled={busy}
          aria-describedby="prompt-composer-hint"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Tulis pertanyaan atau instruksi untuk TANIA…"
          className="max-h-48 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none disabled:opacity-60"
        />

        {voice ? (
          <VoiceButton
            snapshot={voice.snapshot}
            supported={voice.supported}
            onStart={voice.start}
            onCancel={voice.cancel}
          />
        ) : null}

        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          aria-label="Kirim pesan"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white transition-colors hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </div>

      <p id="prompt-composer-hint" className="mt-2 flex justify-between text-[11px] text-muted">
        <span>Enter mengirim · Shift + Enter baris baru</span>
        <span className={remaining < 200 ? 'text-amber-600' : undefined}>
          {remaining} karakter tersisa
        </span>
      </p>

      {voice ? <VoiceStatus snapshot={voice.snapshot} /> : null}
    </form>
  );
}
