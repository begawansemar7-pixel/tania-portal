/**
 * Proactive insights.
 *
 * The governance rule that shapes every type here: **an insight proposes, it
 * never acts.** It carries a suggested prompt a person can choose to run, not
 * a plan already running. Anything it suggests still enters through the
 * ordinary task path — intent, plan, policy, approval — so proactivity adds no
 * second route into enterprise systems.
 */
import type { CapabilityCategory } from './capability.js';
import type { Evidence } from './evidence.js';
import type { RiskLevel } from './risk.js';

export const INSIGHT_KINDS = [
  'KPI_ANOMALY',
  'OVERDUE_TASK',
  'PROJECT_RISK',
  'NEW_DOCUMENT',
  'PERFORMANCE_CHANGE',
] as const;

export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const INSIGHT_SEVERITIES = ['INFO', 'ATTENTION', 'URGENT'] as const;

export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  /** One line a person can act on. */
  headline: string;
  /** What was observed. Never a rationale for a model decision. */
  detail: string;
  /** What TANIA would be doing if asked to follow up. */
  category: CapabilityCategory;
  /** 0–1. Low confidence is shown rather than hidden. */
  confidence: number;
  /** What the insight is based on, so it can be checked. */
  evidence: Evidence[];
  /**
   * The question a person can ask to follow this up.
   *
   * A suggestion, not a queued action: running it is a decision the person
   * makes, and it then goes through the same policy and approval path as
   * anything they typed themselves.
   */
  suggestedPrompt: string;
  /** Risk the follow-up would carry, so the cost is visible before clicking. */
  suggestedRisk: RiskLevel;
  /** What the insight is about, for grouping and de-duplication. */
  subject: string;
  detectedAt: string;
  /** Set when a person dismissed it. */
  dismissedAt?: string;
}

export const INSIGHT_KIND_LABELS: Record<InsightKind, string> = {
  KPI_ANOMALY: 'Anomali KPI',
  OVERDUE_TASK: 'Tugas lewat tenggat',
  PROJECT_RISK: 'Risiko proyek',
  NEW_DOCUMENT: 'Dokumen baru relevan',
  PERFORMANCE_CHANGE: 'Perubahan kinerja signifikan',
};

/** Most urgent first, then most recent. The order a person should read them. */
export function byUrgency(a: Insight, b: Insight): number {
  const order: InsightSeverity[] = ['URGENT', 'ATTENTION', 'INFO'];
  const bySeverity = order.indexOf(a.severity) - order.indexOf(b.severity);
  return bySeverity !== 0 ? bySeverity : b.detectedAt.localeCompare(a.detectedAt);
}
