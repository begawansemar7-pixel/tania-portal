'use client';

import { RouteError } from '@/components/ui/route-error';

export default function AgentsError({
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
      title="Registry agen tidak dapat dimuat"
      description="Daftar agen tidak dapat dibaca saat ini. Kebijakan tool tetap berlaku di sisi server."
    />
  );
}
