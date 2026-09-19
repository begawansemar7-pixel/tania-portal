import { CheckCircle2, CircleDashed, ShieldAlert, ShieldX, XCircle } from 'lucide-react';
import type { TraceStatus, TraceStep } from '@/lib/tania/types';

const STATUS_ICON: Record<TraceStatus, typeof CheckCircle2> = {
  PENDING: CircleDashed,
  RUNNING: CircleDashed,
  SUCCEEDED: CheckCircle2,
  FAILED: XCircle,
  AWAITING_APPROVAL: ShieldAlert,
  BLOCKED: ShieldX,
};

const STATUS_COLOR: Record<TraceStatus, string> = {
  PENDING: 'text-slate-400',
  RUNNING: 'text-brand',
  SUCCEEDED: 'text-emerald-600',
  FAILED: 'text-red-600',
  AWAITING_APPROVAL: 'text-amber-600',
  BLOCKED: 'text-red-600',
};

/**
 * Auditable execution trace. It shows what ran and with what outcome —
 * never the model's internal reasoning.
 */
export function TraceList({ trace }: { trace: TraceStep[] }) {
  return (
    <ol className="space-y-2">
      {trace.map((step) => {
        const Icon = STATUS_ICON[step.status];
        return (
          <li key={step.id} className="flex items-start gap-2.5">
            <Icon className={`mt-0.5 size-4 shrink-0 ${STATUS_COLOR[step.status]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-ink">{step.label}</p>
              <p className="text-[11px] text-muted">
                {step.stage}
                {step.toolId ? ` · ${step.toolId}` : ''}
                {typeof step.durationMs === 'number' ? ` · ${step.durationMs} ms` : ''}
              </p>
              {step.detail ? (
                <p className="mt-0.5 text-xs text-ink-soft">{step.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
