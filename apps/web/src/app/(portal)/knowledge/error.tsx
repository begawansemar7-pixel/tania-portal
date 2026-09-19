'use client';

import { RouteError } from '@/components/ui/route-error';

export default function KnowledgeError({
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
      title="Basis pengetahuan tidak dapat dimuat"
      description="Indeks pengetahuan tidak merespons. Hak akses Anda tetap berlaku saat sumber kembali tersedia."
    />
  );
}
