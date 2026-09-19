import { randomUUID } from 'node:crypto';
import type { Insight, InsightSeverity, RiskLevel } from '@tania/types';
import type { InsightContext, InsightDetector } from '@tania/core/insight';
import type { Initiative, KpiMetric, RiskItem } from '@/lib/portal/types';
import type { EnterpriseDocument } from '@tania/core/knowledge';
import type { TaskReport } from '@tania/types';

/**
 * Five detectors, one shape.
 *
 * Each is given what it may look at and returns what it noticed. None of them
 * holds a tool, reaches a system, or starts work — an insight is a sentence
 * plus a prompt a person may choose to run. That is the whole of the
 * proactivity, and it is deliberately the whole of it.
 */

function insight(input: {
  kind: Insight['kind'];
  severity: InsightSeverity;
  headline: string;
  detail: string;
  category: Insight['category'];
  confidence: number;
  subject: string;
  suggestedPrompt: string;
  suggestedRisk?: RiskLevel;
  detectedAt: string;
}): Insight {
  return {
    id: randomUUID(),
    kind: input.kind,
    severity: input.severity,
    headline: input.headline,
    detail: input.detail,
    category: input.category,
    confidence: input.confidence,
    evidence: [],
    suggestedPrompt: input.suggestedPrompt,
    // Follow-ups default to reading, not doing: an insight must never make a
    // state change look like a single click.
    suggestedRisk: input.suggestedRisk ?? 'LOW',
    subject: input.subject,
    detectedAt: input.detectedAt,
  };
}

/** Percent change parsed from a delta like `-12,4%`. Undefined if absent. */
export function parseDelta(delta: string): number | undefined {
  const match = delta.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : undefined;
}

/** A movement beyond this is worth a person's attention. */
export const KPI_ANOMALY_THRESHOLD = 10;

/** And beyond this it is worth interrupting them. */
export const KPI_URGENT_THRESHOLD = 20;

/**
 * A KPI moving further than usual, in the wrong direction.
 *
 * `deltaIsGood` is honoured rather than the sign: churn falling is good and
 * revenue falling is not, and a detector that cannot tell the difference
 * generates noise people learn to ignore.
 */
export class KpiAnomalyDetector implements InsightDetector<KpiMetric[]> {
  readonly id = 'kpi-anomaly';
  readonly kind = 'KPI_ANOMALY' as const;

  detect(metrics: KpiMetric[], context: InsightContext): Insight[] {
    return metrics.flatMap((metric) => {
      const change = parseDelta(metric.delta);
      if (change === undefined) return [];

      const magnitude = Math.abs(change);
      if (magnitude < KPI_ANOMALY_THRESHOLD || metric.deltaIsGood) return [];

      return [
        insight({
          kind: this.kind,
          severity: magnitude >= KPI_URGENT_THRESHOLD ? 'URGENT' : 'ATTENTION',
          headline: `${metric.label} bergerak ${metric.delta}`,
          detail: `${metric.label} kini ${metric.value} (${metric.caption}). Pergerakan ini di luar rentang biasa dan arahnya tidak diinginkan.`,
          category: 'ANALYZE',
          confidence: Math.min(0.95, 0.5 + magnitude / 100),
          subject: metric.id,
          suggestedPrompt: `Analisa penyebab perubahan ${metric.label} sebesar ${metric.delta}.`,
          detectedAt: context.now.toISOString(),
        }),
      ];
    });
  }
}

/** Initiatives whose milestone date has passed without completing. */
export class OverdueTaskDetector implements InsightDetector<Initiative[]> {
  readonly id = 'overdue-task';
  readonly kind = 'OVERDUE_TASK' as const;

  detect(initiatives: Initiative[], context: InsightContext): Insight[] {
    return initiatives.flatMap((initiative) => {
      const due = new Date(initiative.dueDate);
      if (Number.isNaN(due.getTime()) || due >= context.now) return [];
      if (initiative.progressPct >= 100) return [];

      const days = Math.floor((context.now.getTime() - due.getTime()) / 86_400_000);

      return [
        insight({
          kind: this.kind,
          // A day late is a note; a fortnight late is a problem.
          severity: days >= 14 ? 'URGENT' : 'ATTENTION',
          headline: `${initiative.code} lewat tenggat ${days} hari`,
          detail: `Milestone "${initiative.milestone}" jatuh tempo ${initiative.dueDate} dan progresnya ${initiative.progressPct}%. Pemilik: ${initiative.owner}.`,
          category: 'MONITOR',
          confidence: 0.95,
          subject: initiative.id,
          suggestedPrompt: `Ringkas status dan hambatan inisiatif ${initiative.code}.`,
          detectedAt: context.now.toISOString(),
        }),
      ];
    });
  }
}

/** Open risks that are both severe and due for review. */
export class ProjectRiskDetector implements InsightDetector<RiskItem[]> {
  readonly id = 'project-risk';
  readonly kind = 'PROJECT_RISK' as const;

  detect(risks: RiskItem[], context: InsightContext): Insight[] {
    return risks.flatMap((risk) => {
      if (risk.status === 'CLOSED') return [];

      const severe = risk.impact === 'HIGH' || risk.impact === 'CRITICAL';
      const likely = risk.likelihood === 'HIGH';
      const reviewDue = new Date(risk.reviewBy) < context.now;

      // Severity alone is not news — the register already says it. What is
      // news is a severe risk nobody has looked at lately.
      if (!severe || (!likely && !reviewDue)) return [];

      return [
        insight({
          kind: this.kind,
          severity: severe && likely ? 'URGENT' : 'ATTENTION',
          headline: `Risiko ${risk.impact.toLowerCase()} belum tertangani: ${risk.title}`,
          detail: `Kategori ${risk.category}, kemungkinan ${risk.likelihood.toLowerCase()}, status ${risk.status.toLowerCase()}. Tinjauan jatuh tempo ${risk.reviewBy}. Mitigasi saat ini: ${risk.mitigation}`,
          category: 'RECOMMEND',
          confidence: 0.8,
          subject: risk.id,
          suggestedPrompt: `Usulkan langkah mitigasi tambahan untuk risiko "${risk.title}".`,
          detectedAt: context.now.toISOString(),
        }),
      ];
    });
  }
}

/** How recent a document has to be to be worth mentioning. */
export const NEW_DOCUMENT_DAYS = 7;

/**
 * Documents added recently that the person may not have seen.
 *
 * Only documents already filtered for this actor are passed in, so this can
 * never surface the existence of something they may not access — a headline is
 * a disclosure like any other.
 */
export class NewDocumentDetector implements InsightDetector<EnterpriseDocument[]> {
  readonly id = 'new-document';
  readonly kind = 'NEW_DOCUMENT' as const;

  detect(documents: EnterpriseDocument[], context: InsightContext): Insight[] {
    const cutoff = context.now.getTime() - NEW_DOCUMENT_DAYS * 86_400_000;

    return documents.flatMap((document) => {
      const updated = new Date(document.updatedAt);
      if (Number.isNaN(updated.getTime()) || updated.getTime() < cutoff) return [];

      return [
        insight({
          kind: this.kind,
          severity: 'INFO',
          headline: `Dokumen baru: ${document.title}`,
          detail: `${document.kind} dari ${document.source}, diperbarui ${document.updatedAt}.`,
          category: 'KNOW',
          confidence: 0.9,
          subject: document.id,
          suggestedPrompt: `Ringkas poin utama dokumen "${document.title}".`,
          suggestedRisk: 'INFORMATIONAL',
          detectedAt: context.now.toISOString(),
        }),
      ];
    });
  }
}

/** Below this, a completed task is worth reporting as a change in throughput. */
export const PERFORMANCE_FAILURE_RATIO = 0.3;

/**
 * A meaningful shift in how TANIA's own work is going.
 *
 * Looks at the task history rather than at the business: a run of failures is
 * something the person needs to know about, and nothing else in the interface
 * would tell them.
 */
export class PerformanceChangeDetector implements InsightDetector<TaskReport[]> {
  readonly id = 'performance-change';
  readonly kind = 'PERFORMANCE_CHANGE' as const;

  detect(tasks: TaskReport[], context: InsightContext): Insight[] {
    const settled = tasks.filter((task) =>
      ['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status),
    );

    // Too few to say anything: a single failure is not a trend, and claiming
    // one would be the kind of unsupported assertion this system avoids.
    if (settled.length < 4) return [];

    const failed = settled.filter((task) => task.status !== 'COMPLETED');
    const ratio = failed.length / settled.length;
    if (ratio < PERFORMANCE_FAILURE_RATIO) return [];

    return [
      insight({
        kind: this.kind,
        severity: ratio >= 0.5 ? 'URGENT' : 'ATTENTION',
        headline: `${failed.length} dari ${settled.length} tugas terakhir tidak selesai`,
        detail: `Tingkat kegagalan ${(ratio * 100).toFixed(0)}% pada ${settled.length} tugas terakhir. Penyebab tersering: ${commonReason(failed)}.`,
        category: 'MONITOR',
        confidence: 0.75,
        subject: 'tania.throughput',
        suggestedPrompt: 'Ringkas penyebab kegagalan tugas TANIA terakhir.',
        suggestedRisk: 'INFORMATIONAL',
        detectedAt: context.now.toISOString(),
      }),
    ];
  }
}

function commonReason(tasks: TaskReport[]): string {
  const counts = new Map<string, number>();

  for (const task of tasks) {
    for (const error of task.errors) {
      counts.set(error.code, (counts.get(error.code) ?? 0) + 1);
    }
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? 'tidak tercatat';
}
