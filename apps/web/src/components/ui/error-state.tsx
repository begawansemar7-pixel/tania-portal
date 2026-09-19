'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './button';

/**
 * Shown when a screen could not load its data.
 *
 * It names what failed and offers a retry — never a raw stack trace, which may
 * carry detail a viewer must not see.
 */
export function ErrorState({
  title = 'Data tidak dapat dimuat',
  description,
  onRetry,
  requestId,
  compact = false,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  requestId?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center rounded-2xl border border-amber-200 bg-amber-50/60 text-center ${
        compact ? 'px-5 py-8' : 'px-6 py-12'
      }`}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-ink-soft">{description}</p>
      {requestId ? (
        <p className="mt-2 text-[11px] text-muted">
          ID permintaan: <code className="rounded bg-white/70 px-1.5 py-0.5">{requestId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCcw className="size-4" aria-hidden />
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}
