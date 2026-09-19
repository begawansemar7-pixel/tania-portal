import Link from 'next/link';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { QUICK_ACCESS } from '@/lib/data/portal';
import { TONE_TILE } from '@/components/ui/tone';

export function QuickAccess() {
  return (
    <section className="mt-6 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-[0.14em] text-ink uppercase">
            Quick Access
          </h2>
          <p className="mt-1 text-sm text-muted">Everything you need, right here.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-soft hover:bg-slate-50"
          >
            <LayoutGrid className="size-4" aria-hidden />
            Customize
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-brand hover:bg-brand-soft"
          >
            View All
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {QUICK_ACCESS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-float"
              >
                <span className={`grid size-11 place-items-center rounded-xl ${TONE_TILE[item.tone]}`}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-sm font-bold text-ink">{item.title}</span>
                <span className="text-xs leading-relaxed text-muted">{item.description}</span>
                <span className="mt-auto grid size-8 place-items-center self-end rounded-full bg-slate-50 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
