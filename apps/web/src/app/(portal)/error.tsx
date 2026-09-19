'use client';

import { RouteError } from '@/components/ui/route-error';

/** Catch-all for any portal route without its own error boundary. */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Halaman tidak dapat dimuat"
      description="Terjadi kesalahan saat menyiapkan halaman ini. Coba lagi atau kembali ke Dashboard."
    />
  );
}
