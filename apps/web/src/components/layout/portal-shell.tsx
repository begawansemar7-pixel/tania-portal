'use client';

import { useState, type ReactNode } from 'react';
import { PortalFooter } from './portal-footer';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * Application shell: fixed sidebar on desktop, drawer on small screens, sticky
 * top bar, and a single `main` landmark that the skip link jumps to.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lewati ke konten utama
      </a>

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-60">
        <Topbar onMenuClick={() => setMenuOpen(true)} />
        <main id="main-content" tabIndex={-1} className="px-4 py-6 sm:px-6">
          {children}
        </main>
        <div className="px-4 sm:px-6">
          <PortalFooter />
        </div>
      </div>
    </div>
  );
}
