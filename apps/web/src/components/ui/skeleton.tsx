/**
 * Loading placeholders.
 *
 * Marked `aria-hidden` and paired with a visually hidden status message, so a
 * screen reader hears "memuat" once instead of reading every shimmering box.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} aria-hidden />;
}

export function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <LoadingRegion label="Memuat KPI">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-3 h-3 w-40" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function TableSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="rounded-2xl border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function CardsSkeleton({ count = 3, label }: { count?: number; label: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="mt-4 h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
