import type { Tone } from '@/lib/data/portal';

/** Static class maps — Tailwind needs literal class names at build time. */
export const TONE_TILE: Record<Tone, string> = {
  blue: 'bg-brand-soft text-brand',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-500',
  pink: 'bg-pink-50 text-pink-500',
  red: 'bg-telkom-red-soft text-telkom-red',
};

export const TONE_BAR: Record<Tone, string> = {
  blue: 'bg-brand',
  violet: 'bg-violet-500',
  green: 'bg-emerald-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  red: 'bg-telkom-red',
};
