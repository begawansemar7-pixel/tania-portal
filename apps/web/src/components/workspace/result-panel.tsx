'use client';

import { Bot, FileSearch, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, StatusPill } from '@/components/ui/badges';
import { ApprovalCard } from './approval-card';
import { ConfidenceBadge } from './confidence-badge';
import { EvidenceList } from './evidence-list';
import { actionsOfType, turnText, type TaniaTurn } from './types';

/**
 * The answer as delivered: final text, citations, approval gate, and
 * follow-ups. Separated from the thread so a long answer can be read without
 * losing the conversation.
 */
export function ResultPanel({
  turn,
  busy,
  decidingId,
  onDecide,
  onFollowUp,
}: {
  turn: TaniaTurn | null;
  busy: boolean;
  decidingId: string | null;
  onDecide: (turnId: string, approvalId: string, decision: 'APPROVED' | 'REJECTED') => void;
  onFollowUp: (prompt: string) => void;
}) {
  if (!turn && busy) {
    return (
      <p className="px-5 py-6 text-sm text-muted" role="status">
        Menunggu jawaban pertama…
      </p>
    );
  }

  if (!turn) {
    return (
      <EmptyState
        compact
        icon={FileSearch}
        title="Belum ada hasil"
        description="Jawaban beserta sitasinya akan muncul di sini. Pilih salah satu jawaban di percakapan untuk meninjaunya kembali."
      />
    );
  }

  const suggestions = actionsOfType(turn, 'SUGGESTION');
  const sources = turn.response?.sources ?? [];
  const retrieved = turn.response?.status.retrievedDocuments ?? [];
  const citedCount = retrieved.filter((document) => document.cited).length;

  return (
    <div className="space-y-5 px-5 py-4">
      {turn.response?.status.agent ? (
        <section
          aria-label="Agen penanggung jawab"
          className="rounded-xl border border-line bg-slate-50/60 px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="size-4 text-brand" aria-hidden />
            <p className="text-sm font-semibold text-ink">{turn.response.status.agent.name}</p>
            <span className="text-[11px] text-muted">{turn.response.status.agent.domain}</span>
            {turn.response.status.agent.fallback ? (
              <StatusPill label="Agen default" tone="neutral" />
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-soft">{turn.response.status.agent.rationale}</p>
          {turn.response.status.agent.toolPlan.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted">
              Tool yang boleh dipakai: {turn.response.status.agent.toolPlan.join(', ')}
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Jawaban">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">Jawaban</h3>
          {turn.response ? <RiskBadge risk={turn.response.status.risk} /> : null}
          {turn.response ? (
            <StatusPill
              label={turn.response.status.grounded ? 'Bersitasi' : 'Tanpa rujukan'}
              tone={turn.response.status.grounded ? 'success' : 'warning'}
            />
          ) : null}
          {turn.response?.status.confidence ? (
            <ConfidenceBadge confidence={turn.response.status.confidence} />
          ) : null}
        </div>
        <p className="mt-2 text-sm whitespace-pre-wrap text-ink">
          {turnText(turn)}
          {turn.streaming ? (
            <Loader2 className="ml-1 inline size-3.5 animate-spin text-brand" aria-hidden />
          ) : null}
        </p>
      </section>

      {turn.approval ? (
        <ApprovalCard
          approval={turn.approval}
          pending={decidingId === turn.approval.id}
          onDecide={(decision) =>
            turn.approval ? onDecide(turn.id, turn.approval.id, decision) : undefined
          }
        />
      ) : null}

      <section aria-label="Sitasi">
        <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
          Sitasi ({sources.length})
        </h3>
        <div className="mt-2">
          {turn.streaming && sources.length === 0 ? (
            <p className="text-sm text-muted">Menelusuri sumber…</p>
          ) : (
            <EvidenceList evidence={sources} />
          )}
        </div>
        {retrieved.length > 0 ? (
          <details className="mt-3 rounded-xl border border-line bg-surface px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-ink-soft">
              Dokumen ditelusuri ({retrieved.length}) · dikutip {citedCount}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {retrieved.map((document) => (
                <li key={document.documentId} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={document.cited ? 'font-semibold text-ink' : 'text-muted'}>
                    {document.title}
                  </span>
                  <span className="text-muted">
                    {document.kind} · {document.passages} bagian · {Math.round(document.score * 100)}%
                  </span>
                  {document.cited ? (
                    <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">
                      dikutip
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {suggestions.length > 0 ? (
        <section aria-label="Tindak lanjut">
          <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
            Tindak lanjut
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  onClick={() => onFollowUp(suggestion.prompt ?? suggestion.label)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
