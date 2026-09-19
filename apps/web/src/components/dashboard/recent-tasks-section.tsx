import Link from 'next/link';
import { Bot, History } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, TaskStatusBadge } from '@/components/ui/badges';
import { Section } from '@/components/ui/section';
import { ButtonLink } from '@/components/ui/button';
import { loadDashboard } from '@/lib/portal/load';
import type { SimulatedState } from '@/lib/portal/services';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} dtk` : `${ms} ms`;
}

export async function RecentTasksSection({ simulate }: { simulate: SimulatedState }) {
  const { recentTasks } = await loadDashboard(simulate);
  const awaiting = recentTasks.filter((task) => task.status === 'AWAITING_APPROVAL').length;

  return (
    <Section
      id="recent-tasks"
      title="Recent AI Tasks"
      description={
        recentTasks.length === 0
          ? 'Belum ada eksekusi'
          : `${recentTasks.length} eksekusi terakhir · ${awaiting} menunggu persetujuan`
      }
      action={
        <ButtonLink href="/my-work" variant="secondary" size="sm">
          Buka My Work
        </ButtonLink>
      }
      className="h-full"
    >
      {recentTasks.length === 0 ? (
        <EmptyState
          compact
          icon={History}
          title="Belum ada tugas AI"
          description="Setiap permintaan ke TANIA tercatat di sini beserta status dan tingkat risikonya."
          action={
            <ButtonLink href="/tania" size="sm">
              Mulai dengan TANIA
            </ButtonLink>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {recentTasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Bot className="size-4" aria-hidden />
              </span>
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium text-ink">{task.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {task.agent} · intent {task.intent} · {formatTime(task.startedAt)} ·{' '}
                  {formatDuration(task.durationMs)}
                </p>
              </div>
              <RiskBadge risk={task.risk} />
              <TaskStatusBadge status={task.status} />
              {task.approvalId ? (
                <Link
                  href="/my-work"
                  className="rounded-lg text-xs font-semibold text-brand hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Tinjau
                  <span className="sr-only"> persetujuan untuk {task.title}</span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
