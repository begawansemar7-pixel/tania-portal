/**
 * What TANIA can do, as an employee rather than as a chat box.
 *
 * The six categories are how work is grouped for a person: they answer "what
 * kind of thing is TANIA doing for me", which is a different question from
 * "which pipeline stage is running" (`CapabilityStage`) and from "what did the
 * user ask for" (`Intent`).
 *
 * The ordering matters: each category generally depends on the ones before it.
 * You cannot analyse what you do not know, or recommend what you have not
 * analysed, and **EXECUTE is deliberately last** — it is the only one that
 * changes anything outside TANIA.
 */
import type { Intent } from './intent.js';
import type { RiskLevel } from './risk.js';

export const CAPABILITY_CATEGORIES = [
  'KNOW',
  'ANALYZE',
  'CREATE',
  'RECOMMEND',
  'EXECUTE',
  'MONITOR',
] as const;

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

export function isCapabilityCategory(value: unknown): value is CapabilityCategory {
  return (CAPABILITY_CATEGORIES as readonly unknown[]).includes(value);
}

export interface CapabilityCategoryInfo {
  id: CapabilityCategory;
  label: string;
  description: string;
  /** The highest risk work in this category normally carries. */
  typicalRisk: RiskLevel;
  /** True when work here can change something outside TANIA. */
  changesState: boolean;
}

export const CAPABILITY_CATEGORY_INFO: Record<CapabilityCategory, CapabilityCategoryInfo> = {
  KNOW: {
    id: 'KNOW',
    label: 'Mengetahui',
    description: 'Menemukan dan mengutip dokumen serta kebijakan yang boleh diakses.',
    typicalRisk: 'INFORMATIONAL',
    changesState: false,
  },
  ANALYZE: {
    id: 'ANALYZE',
    label: 'Menganalisis',
    description: 'Membaca metrik dan catatan enterprise lalu menjelaskan apa artinya.',
    typicalRisk: 'LOW',
    changesState: false,
  },
  CREATE: {
    id: 'CREATE',
    label: 'Membuat',
    description: 'Menyusun draf dokumen, ringkasan, dan artefak kerja.',
    typicalRisk: 'MEDIUM',
    changesState: false,
  },
  RECOMMEND: {
    id: 'RECOMMEND',
    label: 'Merekomendasikan',
    description: 'Mengusulkan langkah berdasarkan bukti, tanpa menjalankannya.',
    typicalRisk: 'LOW',
    changesState: false,
  },
  EXECUTE: {
    id: 'EXECUTE',
    label: 'Menjalankan',
    description: 'Menjalankan aksi pada sistem enterprise setelah disetujui manusia.',
    typicalRisk: 'HIGH',
    changesState: true,
  },
  MONITOR: {
    id: 'MONITOR',
    label: 'Memantau',
    description: 'Mengamati perubahan dan memunculkan hal yang perlu perhatian.',
    typicalRisk: 'INFORMATIONAL',
    changesState: false,
  },
};

/**
 * The category a request falls into, from what the user asked.
 *
 * `CONVERSE` maps to `KNOW` because an unclassified question is answered from
 * knowledge — never by assuming it wants something done.
 */
export const CATEGORY_FOR_INTENT: Record<Intent, CapabilityCategory> = {
  SEARCH: 'KNOW',
  ANALYZE: 'ANALYZE',
  CREATE: 'CREATE',
  AUTOMATE: 'EXECUTE',
  CONVERSE: 'KNOW',
};

/**
 * The highest category reached by a set of them.
 *
 * Used to label a task by the most consequential thing it did: a task that
 * retrieved, analysed and then executed is an EXECUTE task, because that is
 * what a person needs to see first.
 */
export function highestCategory(
  categories: readonly CapabilityCategory[],
): CapabilityCategory | undefined {
  const order: CapabilityCategory[] = ['KNOW', 'ANALYZE', 'CREATE', 'RECOMMEND', 'EXECUTE'];

  return categories.reduce<CapabilityCategory | undefined>((highest, category) => {
    if (category === 'MONITOR') return highest;
    if (highest === undefined) return category;
    return order.indexOf(category) > order.indexOf(highest) ? category : highest;
  }, undefined);
}
