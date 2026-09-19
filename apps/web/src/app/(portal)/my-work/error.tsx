'use client';

import { RouteError } from '@/components/ui/route-error';

export default function MyWorkError({
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
      title="Antrian kerja tidak dapat dimuat"
      description="Sumber antrian kerja tidak merespons. Approval gate tetap aman tersimpan di backend."
    />
  );
}
