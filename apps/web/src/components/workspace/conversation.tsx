'use client';

import { Loader2, Sparkles, User } from 'lucide-react';
import { RiskBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/empty-state';
import { QuickActions } from './quick-actions';
import { PHASE_LABEL } from '@/lib/tania/api/tania-client';
import type { Intent } from '@/lib/tania/types';
import { turnText, type Turn } from './types';

/**
 * The conversation itself.
 *
 * Marked as a log with a polite live region so a screen reader announces new
 * answers without interrupting what the user is doing.
 */
export function Conversation({
  turns,
  busy,
  selectedId,
  onSelect,
  onQuickAction,
}: {
  turns: Turn[];
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onQuickAction: (prompt: string, intent: Intent) => void;
}) {
  if (turns.length === 0 && !busy) {
    return (
      <div className="px-4 py-8 sm:px-6">
        <EmptyState
          icon={Sparkles}
          title="Mulai percakapan dengan TANIA"
          description="Tanyakan kebijakan, minta analisis, susun draf, atau rencanakan otomasi. Setiap jawaban membawa bukti, tool yang dipakai, dan jejak eksekusinya."
        />
        <div className="mx-auto mt-6 max-w-2xl">
          <h3 className="mb-3 text-xs font-bold tracking-[0.14em] text-muted uppercase">
            Aksi cepat
          </h3>
          <QuickActions onSelect={onQuickAction} />
        </div>
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Percakapan dengan TANIA"
      className="space-y-4 px-4 py-5 sm:px-6"
    >
      {turns.map((turn) =>
        turn.role === 'user' ? (
          <article key={turn.id} className="flex justify-end">
            <div className="flex max-w-2xl items-start gap-2.5">
              <p className="rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                {turn.text}
              </p>
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-ink-soft"
                aria-hidden
              >
                <User className="size-4" />
              </span>
            </div>
          </article>
        ) : (
          <article key={turn.id} className="flex items-start gap-2.5">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"
              aria-hidden
            >
              <Sparkles className="size-4" />
            </span>

            <button
              type="button"
              onClick={() => onSelect(turn.id)}
              aria-pressed={selectedId === turn.id}
              className={`min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                selectedId === turn.id
                  ? 'border-brand/50 bg-brand-soft/40'
                  : 'border-line bg-slate-50/60 hover:border-brand/30'
              }`}
            >
              <span className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span className="font-semibold text-ink">TANIA</span>
                {turn.response ? <span>intent {turn.response.intent.value}</span> : null}
                {turn.response ? <RiskBadge risk={turn.response.status.risk} /> : null}
                {turn.streaming ? (
                  <span className="inline-flex items-center gap-1.5 text-brand">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    {turn.phase ? PHASE_LABEL[turn.phase] : 'Memproses'}…
                  </span>
                ) : null}
                <span className="ml-auto text-brand">
                  {selectedId === turn.id ? 'Ditampilkan di panel' : 'Lihat di panel'}
                </span>
              </span>
              <span className="line-clamp-6 block text-sm whitespace-pre-wrap text-ink">
                {turnText(turn) || 'Menyiapkan jawaban…'}
              </span>
              {turn.response ? (
                <span className="mt-2 block text-[11px] text-muted">
                  Jawaban lengkap, bukti, dan jejak eksekusi ada di panel kanan.
                </span>
              ) : null}
            </button>
          </article>
        ),
      )}

      {busy && !turns.some((turn) => turn.role === 'tania' && turn.streaming) ? (
        <p className="flex items-center gap-2 pl-11 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          TANIA sedang menyusun jawaban…
        </p>
      ) : null}
    </div>
  );
}
