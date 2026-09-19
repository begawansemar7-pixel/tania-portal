import type { Confidence, ConfidenceLevel } from '@tania/types';

const STYLE: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-amber-200',
  LOW: 'bg-orange-50 text-orange-700 ring-orange-200',
  NONE: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const LABEL: Record<ConfidenceLevel, string> = {
  HIGH: 'Keyakinan tinggi',
  MEDIUM: 'Keyakinan sedang',
  LOW: 'Keyakinan rendah',
  NONE: 'Tanpa dasar rujukan',
};

/**
 * How well retrieval supported the answer.
 *
 * Shown next to the answer rather than buried in a panel: a reader deciding
 * whether to act on something needs to see how thin the ground is.
 */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STYLE[confidence.level]}`}
      title={confidence.rationale}
    >
      {LABEL[confidence.level]}
      <span className="font-normal opacity-80">{Math.round(confidence.score * 100)}%</span>
    </span>
  );
}
