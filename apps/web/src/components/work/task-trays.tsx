'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, ListChecks } from 'lucide-react';
import type { TaskReport, WorkGroup } from '@tania/types';
import { WORK_GROUP_LABELS, WORK_GROUPS, workGroupFor } from '@tania/types';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, TaskStateBadge } from '@/components/ui/badges';

/**
 * The four trays a task can be in.
 *
 * Grouped by what the person has to do about it rather than by lifecycle
 * state: running work needs nothing, a gate needs a decision, and a failure
 * needs a look. That is why `BLOCKED` and `CANCELLED` sit with `FAILED` — from
 * this side they are all "this did not happen".
 */
export function TaskTrays({ tasks }: { tasks: TaskReport[] }) {
  const grouped = new Map<WorkGroup, TaskReport[]>(WORK_GROUPS.map((group) => [group, []]));
  for (const task of tasks) grouped.get(workGroupFor(task.status))?.push(task);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Belum ada tugas"
        description="Tugas yang Anda mulai di TANIA Workspace akan muncul di sini beserta jejak eksekusinya."
      />
    );
  }

  return (
    <div className="divide-y divide-line">
      {WORK_GROUPS.map((group) => (
        <Tray key={group} group={group} tasks={grouped.get(group) ?? []} />
      ))}
    </div>
  );
}

const TRAY_TONE: Record<WorkGroup, string> = {
  IN_PROGRESS: 'bg-sky-50 text-sky-700',
  PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-rose-50 text-rose-700',
};

function Tray({ group, tasks }: { group: WorkGroup; tasks: TaskReport[] }) {
  return (
    <section className="px-5 py-4" aria-label={WORK_GROUP_LABELS[group]}>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        {WORK_GROUP_LABELS[group]}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TRAY_TONE[group]}`}>
          {tasks.length}
        </span>
      </h3>

      {tasks.length === 0 ? (
        <p className="text-xs text-muted">Kosong.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.taskId}>
              <TaskRow task={task} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One task, with its execution trace one click away.
 *
 * Collapsed by default: the trace is what makes a task auditable, and what
 * makes a list of them unreadable if it is always open.
 */
function TaskRow({ task }: { task: TaskReport }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{task.question}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <TaskStateBadge state={task.status} />
            <RiskBadge risk={task.risk} />
            {task.category ? <span>{task.category}</span> : null}
            <span>{task.agents[0] ?? 'tanpa agen'}</span>
            <span>{task.tools.length} tool</span>
            {task.artifacts.length > 0 ? <span>{task.artifacts.length} artefak</span> : null}
          </span>
        </span>
      </button>

      {open ? <TaskDetail task={task} /> : null}
    </div>
  );
}

function TaskDetail({ task }: { task: TaskReport }) {
  return (
    <div className="space-y-4 border-t border-line px-4 py-3">
      <p className="text-sm text-ink">{task.result || 'Belum ada hasil.'}</p>

      {task.artifacts.length > 0 ? (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
            Artefak
          </h4>
          <ul className="space-y-1">
            {task.artifacts.map((artifact) => (
              <li key={artifact.id} className="flex items-center gap-2 text-xs">
                <FileText className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="text-ink">{artifact.title}</span>
                <span className="text-muted">· {artifact.producedBy}</span>
                <span className={artifact.verified ? 'text-emerald-700' : 'text-amber-700'}>
                  {artifact.verified ? 'terverifikasi' : 'belum terverifikasi'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          Jejak eksekusi
        </h4>
        <ol className="space-y-1">
          {task.trace.map((step) => (
            <li key={step.id} className="flex items-start gap-2 text-xs">
              <span className="w-16 shrink-0 text-muted">{step.stage}</span>
              <span className="min-w-0 flex-1 text-ink">
                {step.label}
                {step.detail ? <span className="block text-muted">{step.detail}</span> : null}
              </span>
              <span className="shrink-0 text-muted">{step.status}</span>
            </li>
          ))}
        </ol>
      </div>

      {task.errors.length > 0 ? (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
            Kendala
          </h4>
          <ul className="space-y-1 text-xs text-amber-700">
            {task.errors.map((error, index) => (
              <li key={`${error.code}-${index}`}>
                {error.code}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!task.verification.ok ? (
        <p className="text-xs text-amber-700">
          Verifikasi menemukan: {task.verification.issues.join(' ')}
        </p>
      ) : null}
    </div>
  );
}
