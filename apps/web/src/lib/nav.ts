import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  BookOpen,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  Settings,
  Sparkles,
  SquareCheck,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Rendered as a count pill; omitted when there is nothing to flag. */
  badge?: number;
}

/** Entry point: the welcome surface from the product mockup. */
export const NAV_HOME: NavItem = {
  href: '/',
  label: 'Home',
  icon: Home,
  description: 'Ringkasan dan akses cepat',
};

/** Primary navigation for the workspace. */
export const NAV_PRIMARY: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Portofolio, inisiatif, KPI, risiko, insight',
  },
  {
    href: '/my-work',
    label: 'My Work',
    icon: SquareCheck,
    description: 'Tugas, review, dan persetujuan Anda',
  },
  {
    href: '/tania',
    label: 'TANIA',
    icon: Sparkles,
    description: 'Workspace percakapan dengan TANIA',
  },
  {
    href: '/knowledge',
    label: 'Knowledge',
    icon: BookOpen,
    description: 'Dokumen, kebijakan, template',
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: Bot,
    description: 'Agen spesialis per domain',
  },
  {
    href: '/documents',
    label: 'Documents',
    icon: FileText,
    description: 'Dokumen kerja dan draf',
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    description: 'Adopsi dan dampak TANIA',
  },
  {
    href: '/command-center',
    label: 'Command Center',
    icon: Gauge,
    description: 'Operasi, mutu, dan jejak tata kelola',
  },
] as const;

/** Pinned to the bottom of the sidebar, as in most enterprise consoles. */
export const NAV_SETTINGS: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
  description: 'Profil, model, tata kelola',
};

export const ALL_NAV_ITEMS: readonly NavItem[] = [NAV_HOME, ...NAV_PRIMARY, NAV_SETTINGS];

export function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Title for the current route, used by the top bar. */
export function currentNavItem(pathname: string): NavItem | undefined {
  return [...ALL_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActivePath(pathname, item.href));
}
