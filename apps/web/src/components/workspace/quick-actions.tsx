'use client';

import { QUICK_INTENTS } from '@/lib/data/portal';
import { TONE_TILE } from '@/components/ui/tone';
import type { Intent } from '@/lib/tania/types';

/** Starter prompts, one per controlled capability. */
export function QuickActions({
  onSelect,
  disabled = false,
  layout = 'grid',
}: {
  onSelect: (prompt: string, intent: Intent) => void;
  disabled?: boolean;
  layout?: 'grid' | 'row';
}) {
  return (
    <ul
      className={
        layout === 'grid'
          ? 'grid gap-3 sm:grid-cols-2'
          : 'flex flex-wrap gap-2'
      }
      aria-label="Aksi cepat"
    >
      {QUICK_INTENTS.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.prompt, item.id)}
              className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand/50 hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONE_TILE[item.tone]}`}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                <span className="block text-xs text-muted">{item.prompt}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
