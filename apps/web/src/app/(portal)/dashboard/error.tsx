'use client';

import { RouteError } from '@/components/ui/route-error';

export default function DashboardError({
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
      title="Dashboard tidak dapat dimuat"
      description="Sumber data ringkasan tidak merespons. Coba lagi, atau buka TANIA untuk bertanya langsung."
    />
  );
}
