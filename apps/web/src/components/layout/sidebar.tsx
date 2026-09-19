'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { NAV_HOME, NAV_PRIMARY, NAV_SETTINGS, isActivePath, type NavItem } from '@/lib/nav';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Makes the drawer behave the way `aria-modal="true"` promises.
 *
 * The attribute is a claim, not an implementation: without this, focus stays on
 * the menu button behind the overlay, Tab walks off into page content a sighted
 * user cannot see, and Escape does nothing. A keyboard or screen-reader user is
 * then stranded in a dialog they cannot leave.
 *
 * Focus returns to whatever opened the drawer, so closing it does not dump the
 * user back at the top of the document.
 */
function useModalDrawer(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = (): HTMLElement[] => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];

    // Focus the dialog itself rather than its first link: a screen reader then
    // announces the dialog's label before its contents.
    dialog.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;

      // `document.activeElement` rather than `event.target`: focus may sit on
      // the dialog container, which is not in the focusable list.
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);

      /**
       * Restore focus only if closing is what cost the user their place.
       *
       * The check cannot simply be "is focus still inside the drawer": this
       * cleanup is a passive effect, so React has already detached the dialog
       * by the time it runs and the browser has reset focus to `body`. That
       * reset is the signal. If focus instead sits on some other element, a
       * navigation moved it deliberately and stealing it back would be worse
       * than doing nothing.
       */
      const active = document.activeElement;
      const focusWasLost = active === null || active === document.body || dialog.contains(active);

      if (focusWasLost && previouslyFocused?.isConnected === true) previouslyFocused.focus();
    };
  }, [open, onClose]);

  return dialogRef;
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-slate-50 hover:text-ink'
      }`}
    >
      <Icon
        className={`size-5 shrink-0 ${active ? 'text-brand' : 'text-slate-400 group-hover:text-ink-soft'}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 ? (
        <span className="rounded-full bg-telkom-red px-1.5 py-0.5 text-[10px] font-bold text-white">
          {item.badge}
          <span className="sr-only"> item perlu perhatian</span>
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-6 scroll-slim">
      <Link
        href="/"
        className="rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={onNavigate}
        aria-label="TANIA — beranda"
      >
        <Image
          src="/brand/telkom-indonesia.png"
          alt="Telkom Indonesia"
          width={165}
          height={130}
          className="h-12 w-auto"
          priority
        />
      </Link>

      <nav aria-label="Navigasi utama" className="flex flex-1 flex-col gap-4">
        <ul className="space-y-1">
          <li>
            <NavLink
              item={NAV_HOME}
              active={isActivePath(pathname, NAV_HOME.href)}
              onNavigate={onNavigate}
            />
          </li>
        </ul>

        <div>
          <h2 className="px-3 pb-2 text-[10px] font-bold tracking-[0.16em] text-muted uppercase">
            Workspace
          </h2>
          <ul className="space-y-1">
            {NAV_PRIMARY.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={isActivePath(pathname, item.href)}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>

        <ul className="mt-auto space-y-1 border-t border-line pt-3">
          <li>
            <NavLink
              item={NAV_SETTINGS}
              active={isActivePath(pathname, NAV_SETTINGS.href)}
              onNavigate={onNavigate}
            />
          </li>
        </ul>
      </nav>

      <div className="px-2">
        <p className="font-script text-xl leading-tight text-ink">
          Stronger People
          <br />
          Smarter Ways
          <br />
          Bigger Impact
        </p>
        <span className="mt-1 block h-0.5 w-14 rounded-full bg-telkom-red" aria-hidden />

        <Image
          src="/brand/scale.png"
          alt="SCALE"
          width={260}
          height={70}
          className="mt-4 h-5 w-auto"
        />
        <ul className="mt-2 space-y-0.5 text-[10px] font-medium tracking-[0.14em] text-muted uppercase">
          <li>People</li>
          <li>Technology</li>
          <li>Collaboration</li>
          <li>Impact</li>
        </ul>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useModalDrawer(open, onClose);

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-surface lg:block"
        aria-label="Navigasi samping"
      >
        <SidebarContent />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/*
            Click-to-dismiss only. Hidden from assistive technology and taken out
            of the tab order: the close button and Escape are the accessible
            paths out, and a full-screen button would otherwise be announced as
            a second, identical "close" control.
          */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="absolute inset-0 bg-ink/40"
            onClick={onClose}
          />
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="relative h-full w-72 max-w-[85vw] bg-surface shadow-float focus:outline-none"
            role="dialog"
            aria-modal="true"
            aria-label="Navigasi"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup navigasi"
              className="absolute top-4 right-4 rounded-lg p-1.5 text-muted hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <X className="size-5" aria-hidden />
            </button>
            <SidebarContent onNavigate={onClose} />
          </div>
        </div>
      ) : null}
    </>
  );
}
