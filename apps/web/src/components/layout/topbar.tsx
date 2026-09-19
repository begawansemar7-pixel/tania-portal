'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { TaniaWordmark } from '@/components/ui/tania-wordmark';
import Link from 'next/link';
import { NAV_SETTINGS, currentNavItem } from '@/lib/nav';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';

/**
 * Top navigation: identity, global search, and where the user currently is.
 *
 * Search hands the query to the TANIA workspace rather than filtering in place,
 * so one input serves both "find" and "ask".
 */
export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const current = currentNavItem(pathname);

  // "/" focuses search, the way every console the team already uses behaves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingElsewhere =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (event.key === '/' && !typingElsewhere) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Buka navigasi"
          className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <div className="flex items-center gap-4">
          <TaniaWordmark />
          {current ? (
            <span className="hidden items-center gap-2 border-l border-line pl-4 xl:flex">
              <span className="text-sm font-semibold text-ink">{current.label}</span>
              <span className="text-xs text-muted">{current.description}</span>
            </span>
          ) : null}
        </div>

        <form
          role="search"
          className="ml-auto hidden max-w-xl flex-1 md:block"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = query.trim();
            if (trimmed.length === 0) return;
            router.push(`/tania?q=${encodeURIComponent(trimmed)}`);
            setQuery('');
          }}
        >
          <label htmlFor="global-search" className="sr-only">
            Cari dokumen, proyek, atau tanya TANIA
          </label>
          <div className="flex items-center gap-3 rounded-full border border-line bg-slate-50 px-4 py-2.5 focus-within:border-brand focus-within:bg-surface">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              id="global-search"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari dokumen, proyek, atau tanya TANIA…"
              className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
            <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted lg:block">
              /
            </kbd>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            className="relative rounded-full p-2 text-ink-soft hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label="Notifikasi — 2 belum dibaca"
          >
            <Bell className="size-5" aria-hidden />
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-telkom-red" aria-hidden />
          </button>

          {/*
            A link to Settings, not a menu button. It previously declared
            `aria-haspopup="menu"` with `aria-expanded={false}` and opened
            nothing — announcing a collapsed menu that could never expand. Until
            there is a real account menu, the honest affordance is the one that
            actually works.
          */}
          <Link
            href={NAV_SETTINGS.href}
            className="flex items-center gap-2 rounded-full border border-line py-1 pr-2 pl-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span
              className="grid size-8 place-items-center rounded-full bg-brand text-sm font-semibold text-white"
              aria-hidden
            >
              {DEMO_ACTOR.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm leading-tight font-semibold text-ink">
                {DEMO_ACTOR.name}
              </span>
              <span className="block text-[11px] leading-tight text-muted">{DEMO_ACTOR.unit}</span>
            </span>
            <span className="sr-only">Buka pengaturan akun</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
