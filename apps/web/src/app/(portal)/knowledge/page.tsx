import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BookOpen, Lock, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Section } from '@/components/ui/section';
import { SectionBoundary } from '@/components/ui/section-boundary';
import { CardsSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ClassificationBadge, StatusPill } from '@/components/ui/badges';
import { ButtonLink } from '@/components/ui/button';
import { loadKnowledge } from '@/lib/portal/load';
import { parseSimulatedState, type SimulatedState } from '@/lib/portal/services';

export const metadata: Metadata = { title: 'Knowledge' };

export const dynamic = 'force-dynamic';

async function CollectionsPanel({ simulate }: { simulate: SimulatedState }) {
  const { collections, accessibleDocuments, hiddenDocuments, clearance } =
    await loadKnowledge(simulate);

  return (
    <Section
      title="Koleksi pengetahuan"
      description={`${accessibleDocuments} dokumen dapat Anda akses · clearance ${clearance}`}
      action={
        <ButtonLink href="/tania" size="sm">
          <Search className="size-4" aria-hidden />
          Tanya TANIA
        </ButtonLink>
      }
      footer={
        hiddenDocuments > 0 ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Lock className="size-4" aria-hidden />
            {hiddenDocuments} dokumen disembunyikan karena klasifikasinya di atas clearance Anda.
            TANIA juga tidak akan mengutipnya.
          </p>
        ) : undefined
      }
    >
      {collections.length === 0 ? (
        <EmptyState
          compact
          icon={BookOpen}
          title="Belum ada koleksi"
          description="Koleksi muncul setelah dokumen diindeks dan hak aksesnya ditetapkan."
        />
      ) : (
        <ul className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {collections.map((collection) => (
            <li
              key={collection.id}
              className="flex h-full flex-col rounded-xl border border-line bg-slate-50/50 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                  <BookOpen className="size-4" aria-hidden />
                </span>
                <ClassificationBadge value={collection.classification} />
              </div>
              <h3 className="mt-3 text-sm font-bold text-ink">{collection.name}</h3>
              <p className="mt-1 flex-1 text-xs text-ink-soft">{collection.description}</p>
              <p className="mt-3 text-[11px] text-muted">
                {collection.documentCount} dokumen · {collection.owner} · diperbarui{' '}
                {collection.updatedAt}
              </p>
              {collection.pending ? (
                <div className="mt-3">
                  <StatusPill label="Menunggu koneksi indeks" tone="warning" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const { simulate } = await searchParams;
  const state = parseSimulatedState(simulate);

  return (
    <>
      <PageHeader
        eyebrow="Knowledge"
        title="Dokumen, kebijakan, dan template DPS"
        description="Basis pengetahuan yang menjadi rujukan jawaban TANIA. Daftar ini sudah disaring sesuai hak akses Anda."
      />

      <div className="mb-6 rounded-2xl border border-brand/20 bg-brand-soft/40 px-5 py-4">
        <p className="text-sm font-semibold text-ink">Pencarian semantik belum aktif</p>
        <p className="mt-1 text-sm text-ink-soft">
          Halaman ini menampilkan koleksi dan hak aksesnya. Penelusuran vektor, ingestion, dan
          peringkat ulang menyusul saat indeks pengetahuan dihubungkan — kontraknya sudah ada di{' '}
          <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">@tania/core/knowledge</code>.
        </p>
      </div>

      <SectionBoundary label="Koleksi pengetahuan">
        <Suspense fallback={<CardsSkeleton label="Memuat koleksi pengetahuan" />}>
          <CollectionsPanel simulate={state} />
        </Suspense>
      </SectionBoundary>
    </>
  );
}
