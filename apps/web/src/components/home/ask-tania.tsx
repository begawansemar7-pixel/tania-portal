'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Mic, Send, Sparkles } from 'lucide-react';
import { QUICK_INTENTS } from '@/lib/data/portal';
import { TONE_TILE } from '@/components/ui/tone';

/**
 * Entry point to the TANIA workspace. The box never calls the model directly;
 * it hands the prompt to /tania which owns the conversation state.
 */
export function AskTania() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function goToWorkspace(prompt: string, intent?: string) {
    const params = new URLSearchParams({ q: prompt });
    if (intent) params.set('intent', intent);
    router.push(`/tania?${params.toString()}`);
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = value.trim();
          if (trimmed.length === 0) return;
          goToWorkspace(trimmed);
        }}
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-card focus-within:border-brand"
      >
        <Sparkles className="size-5 shrink-0 text-brand" aria-hidden />
        <label htmlFor="ask-tania" className="sr-only">
          Tanya TANIA
        </label>
        <input
          id="ask-tania"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask TANIA anything..."
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none sm:text-base"
        />
        <button
          type="button"
          disabled
          title="Input suara aktif setelah layanan speech-to-text terhubung"
          className="grid size-10 shrink-0 cursor-not-allowed place-items-center rounded-full bg-slate-100 text-slate-400"
          aria-label="Input suara (belum tersedia)"
        >
          <Mic className="size-5" aria-hidden />
        </button>
        <button
          type="submit"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white transition-colors hover:bg-brand-dark"
          aria-label="Kirim pertanyaan ke TANIA"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </form>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_INTENTS.map((item) => {
          const Icon = item.icon;
          return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => goToWorkspace(item.prompt, item.id)}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink shadow-card transition-colors hover:border-brand hover:text-brand-dark"
            >
              <span className={`grid size-7 place-items-center rounded-lg ${TONE_TILE[item.tone]}`}>
                <Icon className="size-4" aria-hidden />
              </span>
              {item.label}
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
