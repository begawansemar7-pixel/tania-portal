import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Section } from '@/components/ui/section';
import { SectionBoundary } from '@/components/ui/section-boundary';
import { TableSkeleton } from '@/components/ui/skeleton';
import { WorkQueueView } from '@/components/work/work-queue-view';
import { TaskTrays } from '@/components/work/task-trays';
import { ApprovalGates } from '@/components/work/approval-gates';
import { loadWorkQueue } from '@/lib/portal/load';
import { parseSimulatedState, type SimulatedState } from '@/lib/portal/services';
import { getIdentityProvider, getTaskStore } from '@/lib/tania/container';

export const metadata: Metadata = { title: 'My Work' };

/** Approval gates are runtime state; never prerender this page. */
export const dynamic = 'force-dynamic';

/**
 * Tasks TANIA ran, grouped by what the person has to do about them.
 *
 * Read from the orchestrator's own store rather than from a fixture: this is
 * the record that carries the execution trace, so it is the one that can be
 * audited.
 */
async function TasksPanel() {
  const actor = await getIdentityProvider().getActor();
  const tasks = actor ? await getTaskStore().list(actor, 50) : [];

  return (
    <Section
      title="Tugas TANIA"
      description={
        tasks.length === 0
          ? 'Belum ada tugas yang dijalankan'
          : `${tasks.length} tugas terakhir · klik untuk jejak eksekusi`
      }
      bodyClassName="p-0"
    >
      <TaskTrays tasks={tasks} />
    </Section>
  );
}

async function QueuePanel({ simulate }: { simulate: SimulatedState }) {
  const { items } = await loadWorkQueue(simulate);

  return (
    <Section
      title="Antrian kerja"
      description={items.length === 0 ? 'Tidak ada item aktif' : `${items.length} item aktif`}
      bodyClassName="pb-0"
    >
      <WorkQueueView items={items} />
    </Section>
  );
}

async function ApprovalsPanel({ simulate }: { simulate: SimulatedState }) {
  const { approvals } = await loadWorkQueue(simulate);
  const durable = approvals[0]?.durable ?? false;
  const pending = approvals.filter((approval) => approval.status === 'PENDING').length;

  return (
    <Section
      title="Approval gate"
      description={
        approvals.length === 0
          ? 'Belum ada permintaan persetujuan'
          : `${pending} menunggu keputusan · ${durable ? 'tersimpan di PostgreSQL' : 'sementara di memori proses ini'}`
      }
      className="h-full"
    >
      <ApprovalGates approvals={approvals} />
    </Section>
  );
}

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const { simulate } = await searchParams;
  const state = parseSimulatedState(simulate);

  return (
    <>
      <PageHeader
        eyebrow="My Work"
        title="Tugas, review, dan persetujuan Anda"
        description="Antrian kerja pribadi beserta gate persetujuan yang dibuka TANIA untuk aksi berisiko tinggi."
      />

      <SectionBoundary label="Tugas TANIA">
        <Suspense fallback={<TableSkeleton label="Memuat tugas TANIA" />}>
          <TasksPanel />
        </Suspense>
      </SectionBoundary>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionBoundary label="Antrian kerja">
          <Suspense fallback={<TableSkeleton label="Memuat antrian kerja" />}>
            <QueuePanel simulate={state} />
          </Suspense>
        </SectionBoundary>

        <SectionBoundary label="Approval gate">
          <Suspense fallback={<TableSkeleton rows={2} label="Memuat approval gate" />}>
            <ApprovalsPanel simulate={state} />
          </Suspense>
        </SectionBoundary>
      </div>
    </>
  );
}
