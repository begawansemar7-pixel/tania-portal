import type { Classification, RiskLevel, TraceStatus } from '@/lib/tania/types';
import type { TaskState } from '@tania/types';
import type { HealthStatus } from '@/lib/portal/types';

const RISK_STYLE: Record<RiskLevel, string> = {
  INFORMATIONAL: 'bg-slate-100 text-slate-600 ring-slate-200',
  LOW: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-amber-200',
  HIGH: 'bg-orange-50 text-orange-700 ring-orange-200',
  CRITICAL: 'bg-red-50 text-red-700 ring-red-200',
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset ${RISK_STYLE[risk]}`}
      title={`Tingkat risiko: ${risk}`}
    >
      {risk}
    </span>
  );
}

const CLASSIFICATION_STYLE: Record<Classification, string> = {
  PUBLIC: 'bg-slate-100 text-slate-600',
  INTERNAL: 'bg-brand-soft text-brand-dark',
  CONFIDENTIAL: 'bg-amber-50 text-amber-700',
  RESTRICTED: 'bg-red-50 text-red-700',
};

export function ClassificationBadge({ value }: { value: Classification }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CLASSIFICATION_STYLE[value]}`}
    >
      {value}
    </span>
  );
}

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const styles = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    info: 'bg-brand-soft text-brand-dark',
  } as const;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>
      {label}
    </span>
  );
}

const HEALTH_STYLE: Record<HealthStatus, { label: string; className: string }> = {
  ON_TRACK: { label: 'On track', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  NEEDS_ATTENTION: { label: 'Perlu perhatian', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  AT_RISK: { label: 'At risk', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
  BLOCKED: { label: 'Blocked', className: 'bg-red-50 text-red-700 ring-red-200' },
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  const style = HEALTH_STYLE[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}

const TRACE_STYLE: Record<TraceStatus, { label: string; className: string }> = {
  PENDING: { label: 'Menunggu', className: 'bg-slate-100 text-slate-600' },
  RUNNING: { label: 'Berjalan', className: 'bg-brand-soft text-brand-dark' },
  SUCCEEDED: { label: 'Selesai', className: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Gagal', className: 'bg-red-50 text-red-700' },
  AWAITING_APPROVAL: { label: 'Menunggu persetujuan', className: 'bg-amber-50 text-amber-700' },
  BLOCKED: { label: 'Diblokir kebijakan', className: 'bg-red-50 text-red-700' },
};

export function TaskStatusBadge({ status }: { status: TraceStatus }) {
  const style = TRACE_STYLE[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

/** Tone per task lifecycle state. Terminal states are the loudest. */
const TASK_STATE_TONE: Record<TaskState, string> = {
  REQUESTED: 'bg-slate-100 text-slate-600',
  UNDERSTANDING: 'bg-sky-50 text-sky-700',
  PLANNING: 'bg-sky-50 text-sky-700',
  APPROVAL: 'bg-amber-50 text-amber-700',
  EXECUTING: 'bg-sky-50 text-sky-700',
  VERIFYING: 'bg-sky-50 text-sky-700',
  REPORTING: 'bg-sky-50 text-sky-700',
  REMEMBERING: 'bg-sky-50 text-sky-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-rose-50 text-rose-700',
  BLOCKED: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

/** Where a task is in its lifecycle, as the work trays show it. */
export function TaskStateBadge({ state }: { state: TaskState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TASK_STATE_TONE[state]}`}
    >
      {state}
    </span>
  );
}
