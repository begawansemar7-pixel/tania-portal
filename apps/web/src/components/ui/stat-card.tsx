import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { KpiMetric } from '@/lib/portal/types';

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/** A single KPI. Colour follows whether the delta is good, not its direction. */
export function StatCard({ metric }: { metric: KpiMetric }) {
  const Icon = TREND_ICON[metric.trend];
  const tone = metric.deltaIsGood ? 'text-emerald-600' : 'text-red-600';

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{metric.label}</h3>
      <p className="mt-2 text-2xl font-extrabold text-ink">{metric.value}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
        <Icon className="size-4" aria-hidden />
        <span>
          {metric.delta}
          <span className="sr-only">
            {metric.deltaIsGood ? ' (perubahan positif)' : ' (perubahan negatif)'}
          </span>
        </span>
      </p>
      <p className="mt-2 mb-3 text-xs text-muted">{metric.caption}</p>
      {metric.target ? (
        <p className="mt-auto border-t border-line pt-2 text-[11px] text-muted">{metric.target}</p>
      ) : null}
    </article>
  );
}
