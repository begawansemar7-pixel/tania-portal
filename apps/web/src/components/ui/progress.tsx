const TONE = {
  brand: 'bg-brand',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
} as const;

export type ProgressTone = keyof typeof TONE;

/** Accessible progress bar: exposes value, bounds, and a readable label. */
export function Progress({
  value,
  label,
  tone = 'brand',
  className = '',
}: {
  value: number;
  label: string;
  tone?: ProgressTone;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full ${TONE[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
