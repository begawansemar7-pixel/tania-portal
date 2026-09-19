import { PageHeader } from '@/components/ui/page-header';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors the workspace's two-column split, so the layout does not jump when
 * the conversation and the activity panel arrive.
 */
export default function TaniaWorkspaceLoading() {
  return (
    <>
      <PageHeader
        eyebrow="TANIA Workspace"
        title="Bekerja bersama TANIA"
        description="Menyiapkan ruang kerja…"
      />
      <LoadingRegion label="Memuat workspace TANIA">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-4/5 rounded-xl" />
            <Skeleton className="mt-6 h-24 w-full rounded-xl" />
          </div>
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </LoadingRegion>
    </>
  );
}
