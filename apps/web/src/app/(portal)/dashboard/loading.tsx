import { PageHeader } from '@/components/ui/page-header';
import { StatCardsSkeleton, TableSkeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Portofolio, inisiatif, dan risiko DPS"
        description="Menyiapkan ringkasan terbaru…"
      />
      <div className="space-y-6">
        <StatCardsSkeleton />
        <TableSkeleton label="Memuat portofolio produk" />
        <TableSkeleton rows={5} label="Memuat inisiatif aktif" />
      </div>
    </>
  );
}
