import { CardsSkeleton, LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/**
 * Fallback for the portal group.
 *
 * It covers two things at once: Home, which resolves the actor before it can
 * greet anyone, and any route in the group without its own `loading.tsx`. That
 * dual role is why the shape is deliberately neutral — a hero-shaped skeleton
 * would be right for Home and visibly wrong on Analytics or Command Center.
 *
 * A route whose real layout differs enough to cause a jump should add its own
 * `loading.tsx`, as Dashboard and the TANIA workspace do.
 */
export default function PortalLoading() {
  return (
    <LoadingRegion label="Memuat halaman">
      <div className="space-y-6">
        <div>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-7 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>
        <CardsSkeleton count={3} label="Memuat konten" />
      </div>
    </LoadingRegion>
  );
}
