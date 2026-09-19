'use client';

import { useEffect } from 'react';
import { ErrorState } from './error-state';

/**
 * Route-level error UI.
 *
 * Next passes the error and a `reset` callback; the digest is shown so a report
 * can be matched to the server log without exposing the underlying message.
 */
export function RouteError({
  error,
  reset,
  title,
  description,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
}) {
  useEffect(() => {
    // Surfaced in the browser console for the developer; the server already
    // logged the real cause with its correlation id.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <ErrorState
        title={title}
        description={error.message || description}
        onRetry={reset}
        {...(error.digest === undefined ? {} : { requestId: error.digest })}
      />
    </div>
  );
}
