import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Section } from '@/components/ui/section';
import { SectionBoundary } from '@/components/ui/section-boundary';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  AgentPerformancePanel,
  AiTasksPanel,
  ApprovalQueuePanel,
  ErrorsPanel,
  GovernancePanel,
  QualityPanel,
  Tally,
  ToolUsagePanel,
  hoursSaved,
} from '@/components/command-center/panels';
import {
  getEvaluator,
  getGovernance,
  getGovernanceSink,
  getIdentityProvider,
  getTaskStore,
} from '@/lib/tania/container';

export const metadata: Metadata = { title: 'Command Center' };

/** Everything here is runtime state; never prerender it. */
export const dynamic = 'force-dynamic';

async function Panels() {
  const actor = await getIdentityProvider().getActor();
  if (!actor) return null;

  const tasks = await getTaskStore().list(actor, 200);
  const report = getEvaluator().evaluate({ tasks, events: await getGovernanceSink().all() });
  const governance = getGovernance();

  // Only an auditor sees the trail; everyone else sees the counts above it.
  const events = actor.scopes.includes('audit:read') ? await governance.list(actor, 100) : [];

  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <AiTasksPanel tasks={tasks} />

      <Section
        title="Ringkasan"
        description="Penyelesaian dan perkiraan waktu yang dihemat"
      >
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <Tally label="Tugas selesai" value={completed} tone="emerald" />
          <Tally
            label="Jam dihemat (perkiraan)"
            value={hoursSaved(tasks)}
          />
          <Tally label="Metrik di luar ambang" value={report.failing.length} tone="amber" />
        </div>
        <p className="px-5 pb-4 text-[11px] text-muted">
          Jam yang dihemat adalah <strong>perkiraan</strong> dari durasi manual per jenis
          pekerjaan, bukan pengukuran. Angka ini tidak boleh dipakai untuk klaim penghematan
          tanpa studi tersendiri.
        </p>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AgentPerformancePanel tasks={tasks} />
        <ToolUsagePanel tasks={tasks} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ApprovalQueuePanel tasks={tasks} />
        <ErrorsPanel tasks={tasks} />
      </div>

      <QualityPanel report={report} />

      {actor.scopes.includes('audit:read') ? (
        <GovernancePanel events={events} durable={governance.durable} />
      ) : null}
    </div>
  );
}

export default function CommandCenterPage() {
  return (
    <>
      <PageHeader
        eyebrow="Command Center"
        title="Operasi dan mutu TANIA"
        description="Tugas, kinerja agen, pemakaian tool, antrian persetujuan, kendala, dan mutu jawaban — dihitung dari jejak eksekusi yang sebenarnya."
      />

      <SectionBoundary label="Command Center">
        <Suspense fallback={<TableSkeleton label="Memuat command center" />}>
          <Panels />
        </Suspense>
      </SectionBoundary>
    </>
  );
}
