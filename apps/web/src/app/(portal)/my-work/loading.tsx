import { TableSkeleton } from '@/components/ui/skeleton';

export default function MyWorkLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <TableSkeleton label="Memuat antrian kerja" />
      <TableSkeleton rows={2} label="Memuat approval gate" />
    </div>
  );
}
