import { Gauge } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { loadDashboard } from '@/lib/portal/load';
import type { SimulatedState } from '@/lib/portal/services';

export async function KpiSection({ simulate }: { simulate: SimulatedState }) {
  const { kpis } = await loadDashboard(simulate);

  if (kpis.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface shadow-card">
        <EmptyState
          compact
          icon={Gauge}
          title="Belum ada KPI yang dipublikasikan"
          description="KPI muncul setelah konektor analitik dihubungkan dan periode pelaporan ditutup."
        />
      </div>
    );
  }

  return (
    <section aria-label="Indikator kinerja utama">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((metric) => (
          <li key={metric.id}>
            <StatCard metric={metric} />
          </li>
        ))}
      </ul>
    </section>
  );
}
