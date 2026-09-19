import Link from 'next/link';
import { Lightbulb, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Section } from '@/components/ui/section';
import { loadDashboard } from '@/lib/portal/load';
import type { SimulatedState } from '@/lib/portal/services';

export async function InsightsSection({ simulate }: { simulate: SimulatedState }) {
  const { insights } = await loadDashboard(simulate);

  return (
    <Section
      id="insights"
      title="TANIA Insights"
      description="Temuan proaktif, selalu dengan jumlah bukti pendukungnya"
      className="h-full"
    >
      {insights.length === 0 ? (
        <EmptyState
          compact
          icon={Lightbulb}
          title="Belum ada insight"
          description="TANIA memunculkan insight setelah ada cukup data dan dokumen yang dapat dirujuk."
        />
      ) : (
        <ul className="divide-y divide-line">
          {insights.map((insight) => (
            <li key={insight.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{insight.headline}</p>
                  <p className="mt-1 text-xs text-ink-soft">{insight.detail}</p>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {insight.stage} · keyakinan {Math.round(insight.confidence * 100)}% ·{' '}
                    {insight.evidenceCount} bukti
                  </p>
                  <Link
                    href={`/tania?q=${encodeURIComponent(insight.suggestedPrompt)}`}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-brand hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    Tindak lanjuti dengan TANIA
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
