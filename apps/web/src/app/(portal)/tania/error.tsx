'use client';

import { RouteError } from '@/components/ui/route-error';

export default function TaniaError({
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
      title="Workspace tidak dapat dibuka"
      description="Workspace gagal dimuat. Coba lagi; percakapan sebelumnya tetap tersimpan di backend."
    />
  );
}
