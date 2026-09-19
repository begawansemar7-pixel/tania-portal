import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Workspace } from '@/components/workspace/workspace';
import { isIntent } from '@tania/types';
import type { Intent } from '@/lib/tania/types';

export const metadata: Metadata = { title: 'TANIA Workspace' };

function toIntent(value: string | undefined): Intent | undefined {
  return isIntent(value) ? value : undefined;
}

export default async function TaniaWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; intent?: string }>;
}) {
  const { q, intent } = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="TANIA Workspace"
        title="Bekerja bersama TANIA"
        description="Percakapan di kiri, aktivitas eksekusi dan hasil di kanan. Setiap jawaban menyertakan bukti dan jejak eksekusi; aksi berisiko tinggi selalu menunggu persetujuan manusia."
      />
      <Workspace {...(q === undefined ? {} : { initialQuery: q })} initialIntent={toIntent(intent)} />
    </>
  );
}
