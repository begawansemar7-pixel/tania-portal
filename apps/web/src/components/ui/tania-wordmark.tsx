import { Sparkles } from 'lucide-react';

/** TANIA wordmark as used across the portal chrome. */
export function TaniaWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-start gap-1">
      <div>
        <div className="flex items-start">
          <span className="text-2xl leading-none font-extrabold tracking-tight text-ink">
            TANIA
          </span>
          <Sparkles className="-mt-1 ml-0.5 size-4 text-brand" aria-hidden />
        </div>
        {compact ? null : (
          <p className="mt-1 text-[10px] tracking-[0.08em] text-muted">
            AI for a Better Indonesia
          </p>
        )}
      </div>
    </div>
  );
}
