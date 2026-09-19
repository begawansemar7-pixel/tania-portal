import type { Actor } from '@/lib/identity/types';
import type { Insight } from '@tania/types';
import { byUrgency } from '@tania/types';
import type { InsightContext, InsightService } from '@tania/core/insight';
import type { EnterpriseDocument } from '@tania/core/knowledge';
import type { Initiative, KpiMetric, RiskItem } from '@/lib/portal/types';
import type { TaskReport } from '@tania/types';
import { logger } from '@/lib/logger';
import {
  KpiAnomalyDetector,
  NewDocumentDetector,
  OverdueTaskDetector,
  PerformanceChangeDetector,
  ProjectRiskDetector,
} from './detectors';

/**
 * What the detectors are allowed to see.
 *
 * Assembled by the caller under the caller's permissions, and handed over as
 * plain data. A detector cannot widen its own access because it never holds
 * anything that could fetch more.
 */
export interface InsightSources {
  kpis: () => Promise<KpiMetric[]>;
  initiatives: () => Promise<Initiative[]>;
  risks: () => Promise<RiskItem[]>;
  /** Already filtered for the actor: a headline is a disclosure too. */
  documents: (actor: Actor) => Promise<EnterpriseDocument[]>;
  tasks: (actor: Actor) => Promise<TaskReport[]>;
}

/**
 * Runs the detectors and keeps what they found.
 *
 * Two behaviours are worth naming. A detector that throws is logged and
 * skipped rather than failing the scan — one broken detector must not cost the
 * person every other insight. And an insight about a subject already surfaced
 * is not duplicated, because the same overdue initiative reported five times
 * is how a proactive system teaches people to ignore it.
 */
export class DetectorInsightService implements InsightService {
  readonly id = 'detectors';

  private readonly insights = new Map<string, { actorId: string; insight: Insight }>();

  private readonly kpi = new KpiAnomalyDetector();
  private readonly overdue = new OverdueTaskDetector();
  private readonly risk = new ProjectRiskDetector();
  private readonly document = new NewDocumentDetector();
  private readonly performance = new PerformanceChangeDetector();

  constructor(private readonly sources: InsightSources) {}

  async scan(context: InsightContext): Promise<Insight[]> {
    const runs: Array<Promise<Insight[]>> = [
      this.run('kpi', async () => this.kpi.detect(await this.sources.kpis(), context)),
      this.run('overdue', async () =>
        this.overdue.detect(await this.sources.initiatives(), context),
      ),
      this.run('risk', async () => this.risk.detect(await this.sources.risks(), context)),
      this.run('document', async () =>
        this.document.detect(await this.sources.documents(context.actor), context),
      ),
      this.run('performance', async () =>
        this.performance.detect(await this.sources.tasks(context.actor), context),
      ),
    ];

    const found = (await Promise.all(runs)).flat();
    const kept: Insight[] = [];

    for (const insight of found) {
      if (this.alreadyKnown(insight, context.actor)) continue;
      this.insights.set(insight.id, { actorId: context.actor.id, insight });
      kept.push(insight);
    }

    logger.info('insight.scan', {
      actorId: context.actor.id,
      found: found.length,
      kept: kept.length,
    });

    return kept.sort(byUrgency);
  }

  async list(
    actor: Actor,
    options: { limit?: number; includeDismissed?: boolean } = {},
  ): Promise<Insight[]> {
    return [...this.insights.values()]
      .filter((entry) => entry.actorId === actor.id)
      .map((entry) => entry.insight)
      .filter((insight) => options.includeDismissed === true || insight.dismissedAt === undefined)
      .sort(byUrgency)
      .slice(0, options.limit ?? 20);
  }

  async dismiss(insightId: string, actor: Actor): Promise<Insight | undefined> {
    const entry = this.insights.get(insightId);
    if (!entry || entry.actorId !== actor.id) return undefined;

    const dismissed: Insight = { ...entry.insight, dismissedAt: new Date().toISOString() };
    this.insights.set(insightId, { ...entry, insight: dismissed });
    return dismissed;
  }

  /** One broken detector must not cost the person every other insight. */
  private async run(name: string, detect: () => Promise<Insight[]>): Promise<Insight[]> {
    try {
      return await detect();
    } catch (error) {
      logger.warn('insight.detector_failed', {
        detector: name,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return [];
    }
  }

  private alreadyKnown(insight: Insight, actor: Actor): boolean {
    return [...this.insights.values()].some(
      (entry) =>
        entry.actorId === actor.id &&
        entry.insight.kind === insight.kind &&
        entry.insight.subject === insight.subject &&
        entry.insight.dismissedAt === undefined,
    );
  }
}

export {
  KpiAnomalyDetector,
  NewDocumentDetector,
  OverdueTaskDetector,
  PerformanceChangeDetector,
  ProjectRiskDetector,
  parseDelta,
  KPI_ANOMALY_THRESHOLD,
  KPI_URGENT_THRESHOLD,
  NEW_DOCUMENT_DAYS,
  PERFORMANCE_FAILURE_RATIO,
} from './detectors';
