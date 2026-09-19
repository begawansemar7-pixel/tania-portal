import { CalendarClock, Rocket } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { HealthBadge, RiskBadge } from '@/components/ui/badges';
import { Progress } from '@/components/ui/progress';
import { Section } from '@/components/ui/section';
import { loadDashboard } from '@/lib/portal/load';
import type { SimulatedState } from '@/lib/portal/services';
import type { HealthStatus } from '@/lib/portal/types';

const PROGRESS_TONE: Record<HealthStatus, 'brand' | 'success' | 'warning' | 'danger'> = {
  ON_TRACK: 'success',
  NEEDS_ATTENTION: 'warning',
  AT_RISK: 'danger',
  BLOCKED: 'danger',
};

export async function InitiativesSection({ simulate }: { simulate: SimulatedState }) {
  const { initiatives } = await loadDashboard(simulate);
  const attention = initiatives.filter((item) => item.status !== 'ON_TRACK').length;

  return (
    <Section
      id="initiatives"
      title="Active Initiatives"
      description={
        initiatives.length === 0
          ? 'Belum ada inisiatif berjalan'
          : `${initiatives.length} inisiatif berjalan · ${attention} perlu perhatian`
      }
    >
      {initiatives.length === 0 ? (
        <EmptyState
          compact
          icon={Rocket}
          title="Tidak ada inisiatif aktif"
          description="Inisiatif yang sedang berjalan akan muncul di sini beserta milestone terdekatnya."
        />
      ) : (
        <ul className="divide-y divide-line">
          {initiatives.map((initiative) => (
            <li key={initiative.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-56 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    {initiative.code}
                  </code>
                  <p className="text-sm font-semibold text-ink">{initiative.name}</p>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span>{initiative.squad}</span>
                  <span aria-hidden>·</span>
                  <span>{initiative.owner}</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden />
                    {initiative.milestone} — {initiative.dueDate}
                  </span>
                </p>
              </div>

              <div className="w-40">
                <Progress
                  value={initiative.progressPct}
                  label={`Progres ${initiative.name}`}
                  tone={PROGRESS_TONE[initiative.status]}
                />
                <p className="mt-1 text-[11px] text-muted">{initiative.progressPct}% selesai</p>
              </div>

              <div className="flex items-center gap-2">
                <RiskBadge risk={initiative.risk} />
                <HealthBadge status={initiative.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
