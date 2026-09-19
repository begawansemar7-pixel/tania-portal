import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ClassificationBadge } from '@/components/ui/badges';
import { KNOWLEDGE_DOCUMENTS } from '@/lib/data/knowledge';
import { canRead } from '@/lib/tania/rag/mock-retriever';
import { getIdentityProvider } from '@/lib/tania/container';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const actor = await getIdentityProvider().getActor();
  if (!actor) return null;

  const documents = KNOWLEDGE_DOCUMENTS.filter(
    (doc) => canRead(actor, doc.classification) && doc.category !== 'Policy',
  );

  return (
    <>
      <PageHeader
        eyebrow="Documents"
        title="Dokumen kerja dan draf"
        description="Materi kerja yang dapat dijadikan dasar draf oleh TANIA. Draf baru hanya terlihat oleh pembuatnya sampai dibagikan."
      />

      <Card>
        <CardHeader
          title="Workspace dokumen"
          subtitle={`${documents.length} dokumen tersedia untuk Anda`}
          action={
            <Link
              href="/tania?q=Buatkan%20draf%20dokumen%20berdasarkan%20template%20DPS&intent=CREATE"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
            >
              <Plus className="size-4" aria-hidden />
              Draf baru dengan TANIA
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start gap-3 px-5 py-4">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <FileText className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{doc.title}</p>
                  <ClassificationBadge value={doc.classification} />
                </div>
                <p className="mt-1 text-sm text-ink-soft">{doc.summary}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {doc.category} · {doc.owner} · diperbarui {doc.updatedAt}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
