import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { SectionBoundary } from '@/components/ui/section-boundary';
import { CardsSkeleton, StatCardsSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { KpiSection } from '@/components/dashboard/kpi-section';
import { PortfolioSection } from '@/components/dashboard/portfolio-section';
import { InitiativesSection } from '@/components/dashboard/initiatives-section';
import { RisksSection } from '@/components/dashboard/risks-section';
import { InsightsSection } from '@/components/dashboard/insights-section';
import { RecentTasksSection } from '@/components/dashboard/recent-tasks-section';
import { parseSimulatedState } from '@/lib/portal/services';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Each panel streams behind its own Suspense boundary and fails inside its own
 * error boundary, so a slow or broken source degrades one card, not the page.
 *
 * `?simulate=empty|error|slow` exercises those states against the mock data.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const { simulate } = await searchParams;
  const state = parseSimulatedState(simulate);

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Portofolio, inisiatif, dan risiko DPS"
        description="Ringkasan kesehatan Digital Product & Solution beserta temuan proaktif TANIA. Data contoh sampai konektor enterprise dihubungkan."
      />

      <div className="space-y-6">
        <SectionBoundary label="KPI">
          <Suspense fallback={<StatCardsSkeleton />}>
            <KpiSection simulate={state} />
          </Suspense>
        </SectionBoundary>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <SectionBoundary label="Product Portfolio">
              <Suspense fallback={<TableSkeleton label="Memuat portofolio produk" />}>
                <PortfolioSection simulate={state} />
              </Suspense>
            </SectionBoundary>
          </div>

          <SectionBoundary label="TANIA Insights">
            <Suspense fallback={<TableSkeleton rows={3} label="Memuat insight TANIA" />}>
              <InsightsSection simulate={state} />
            </Suspense>
          </SectionBoundary>
        </div>

        <SectionBoundary label="Active Initiatives">
          <Suspense fallback={<TableSkeleton rows={5} label="Memuat inisiatif aktif" />}>
            <InitiativesSection simulate={state} />
          </Suspense>
        </SectionBoundary>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <SectionBoundary label="Risks">
            <Suspense fallback={<CardsSkeleton count={2} label="Memuat daftar risiko" />}>
              <RisksSection simulate={state} />
            </Suspense>
          </SectionBoundary>

          <SectionBoundary label="Recent AI Tasks">
            <Suspense fallback={<CardsSkeleton count={2} label="Memuat tugas AI terbaru" />}>
              <RecentTasksSection simulate={state} />
            </Suspense>
          </SectionBoundary>
        </div>
      </div>
    </>
  );
}
