import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shown when a query succeeded and legitimately returned nothing. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? 'px-5 py-8' : 'px-6 py-14'}`}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
