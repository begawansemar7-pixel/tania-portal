import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, StatusPill } from '@/components/ui/badges';
import { Section } from '@/components/ui/section';
import { loadDashboard } from '@/lib/portal/load';
import type { SimulatedState } from '@/lib/portal/services';
import type { RiskStatus } from '@/lib/portal/types';

const STATUS_TONE: Record<RiskStatus, 'danger' | 'warning' | 'success'> = {
  OPEN: 'danger',
  MITIGATING: 'warning',
  CLOSED: 'success',
};

const STATUS_LABEL: Record<RiskStatus, string> = {
  OPEN: 'Terbuka',
  MITIGATING: 'Dimitigasi',
  CLOSED: 'Ditutup',
};

export async function RisksSection({ simulate }: { simulate: SimulatedState }) {
  const { risks } = await loadDashboard(simulate);
  const open = risks.filter((risk) => risk.status !== 'CLOSED').length;

  return (
    <Section
      id="risks"
      title="Risks"
      description={risks.length === 0 ? 'Tidak ada risiko tercatat' : `${open} risiko aktif`}
      className="h-full"
    >
      {risks.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="Tidak ada risiko terbuka"
          description="Risiko yang dicatat pemilik inisiatif akan tampil di sini beserta mitigasinya."
        />
      ) : (
        <ul className="divide-y divide-line">
          {risks.map((risk) => (
            <li key={risk.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{risk.title}</p>
                <div className="flex items-center gap-2">
                  <RiskBadge risk={risk.impact} />
                  <StatusPill label={STATUS_LABEL[risk.status]} tone={STATUS_TONE[risk.status]} />
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-soft">{risk.mitigation}</p>
              <p className="mt-1.5 text-[11px] text-muted">
                {risk.category} · pemilik {risk.owner} · kemungkinan {risk.likelihood.toLowerCase()} ·
                tinjau {risk.reviewBy}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
