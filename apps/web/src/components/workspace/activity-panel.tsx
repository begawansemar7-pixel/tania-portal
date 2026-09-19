'use client';

import { Activity, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, TaskStatusBadge } from '@/components/ui/badges';
import { TraceList } from './trace-list';
import { PHASE_LABEL } from '@/lib/tania/api/tania-client';
import { actionsOfType, turnTrace, type TaniaTurn } from './types';
import type { TraceStatus } from '@tania/types';

/**
 * Execution activity for the selected turn: which controlled tools ran, with
 * what outcome. Never model reasoning — only safe execution status.
 */
export function ActivityPanel({ turn, busy }: { turn: TaniaTurn | null; busy: boolean }) {
  if (!turn && busy) {
    return (
      <p className="px-5 py-6 text-sm text-muted" role="status">
        Menyiapkan rencana eksekusi…
      </p>
    );
  }

  if (!turn) {
    return (
      <EmptyState
        compact
        icon={Activity}
        title="Belum ada aktivitas"
        description="Setelah Anda bertanya, setiap langkah eksekusi tampil di sini beserta tool dan durasinya."
      />
    );
  }

  const steps = turnTrace(turn);
  const tools = actionsOfType(turn, 'TOOL');

  return (
    <div className="space-y-5 px-5 py-4">
      {turn.streaming ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl bg-brand-soft/50 px-3 py-2 text-sm text-brand-dark"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {turn.phase ? PHASE_LABEL[turn.phase] : 'Memproses'}…
        </p>
      ) : null}

      <section aria-label="Tool yang digunakan">
        <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
          Tool digunakan
        </h3>
        {tools.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Belum ada tool yang dijalankan.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {tools.map((tool) => (
              <li key={tool.id} className="rounded-xl border border-line bg-slate-50/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{tool.label}</span>
                  {tool.risk ? <RiskBadge risk={tool.risk} /> : null}
                  {tool.status ? <TaskStatusBadge status={tool.status as TraceStatus} /> : null}
                </div>
                {tool.detail ? <p className="mt-1 text-xs text-ink-soft">{tool.detail}</p> : null}
                <code className="mt-1 block text-[11px] text-muted">
                  {tool.id.replace(/^tool:/, '')}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Jejak eksekusi">
        <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
          Jejak eksekusi
        </h3>
        <div className="mt-2">
          {steps.length === 0 ? (
            <p className="text-sm text-muted">Jejak muncul setelah langkah pertama selesai.</p>
          ) : (
            <TraceList trace={steps} />
          )}
        </div>
      </section>

      {turn.response ? (
        <p className="border-t border-line pt-3 text-[11px] text-muted">
          {/* A missing duration renders as "NaN ms", which reads as a bug to the
              user and tells them nothing. The field is typed as required, so
              this only triggers when a caller breaks the contract. */}
          Durasi {formatDuration(turn.response.status.durationMs)} · model{' '}
          {turn.response.status.model} · status {turn.response.status.state}
        </p>
      ) : null}
    </div>
  );
}

/** Milliseconds as text, or an honest dash when there is no number. */
function formatDuration(durationMs: number | undefined): string {
  return Number.isFinite(durationMs) ? `${Math.round(durationMs as number)} ms` : '—';
}
