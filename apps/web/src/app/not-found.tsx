import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Compass className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-ink">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted">
          Tautan yang Anda buka tidak tersedia. Kembali ke Dashboard untuk melanjutkan.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Buka Dashboard
        </Link>
      </div>
    </main>
  );
}
