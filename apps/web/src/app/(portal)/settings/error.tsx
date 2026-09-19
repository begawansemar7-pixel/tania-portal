'use client';

import { RouteError } from '@/components/ui/route-error';

export default function SettingsError({
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
      title="Setelan tidak dapat dimuat"
      description="Konfigurasi runtime tidak dapat dibaca saat ini. Nilai yang berlaku di server tidak berubah."
    />
  );
}
