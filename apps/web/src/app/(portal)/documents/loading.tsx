import { TableSkeleton } from '@/components/ui/skeleton';

export default function DocumentsLoading() {
  return <TableSkeleton rows={5} label="Memuat dokumen" />;
}
