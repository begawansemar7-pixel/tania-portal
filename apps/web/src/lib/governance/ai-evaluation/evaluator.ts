import type {
  EvaluationMetric,
  EvaluationReport,
  GovernanceEvent,
  MetricValue,
  TaskReport,
} from '@tania/types';
import { METRIC_DEFINITIONS, MIN_SAMPLE, evaluateMetric } from '@tania/types';

export interface EvaluationInput {
  tasks: readonly TaskReport[];
  events: readonly GovernanceEvent[];
}

/**
 * Turns what happened into the eight quality numbers.
 *
 * Computed from the governance trail rather than from a separate pipeline, so
 * the numbers describe what actually ran. Two rules keep them honest:
 *
 * - A metric with fewer than `MIN_SAMPLE` observations is **not** reported as
 *   failing. A perfect score over three tasks says nothing, and presenting it
 *   as quality would be the most misleading thing this module could do.
 * - A metric with no observations at all is reported with `sample: 0` rather
 *   than defaulted to 1, so "we did not measure this" never reads as "this is
 *   perfect".
 */
export class TaskEvaluator {
  readonly id = 'task-trail';

  evaluate(input: EvaluationInput, now = new Date()): EvaluationReport {
    const { tasks } = input;
    const settled = tasks.filter((task) =>
      ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(task.status),
    );

    const metrics: MetricValue[] = [
      this.completion(settled),
      this.groundedness(tasks),
      this.citationAccuracy(tasks),
      this.retrievalQuality(tasks),
      this.toolSelection(tasks),
      this.hallucinationRate(tasks),
      this.latency(settled),
      this.failureRate(settled),
    ];

    const failing = metrics
      .filter((metric) => !metric.healthy && metric.sample >= MIN_SAMPLE)
      .sort((a, b) => severity(b) - severity(a))
      .map((metric) => metric.metric);

    const from = tasks.reduce<string>(
      (earliest, task) => (task.createdAt < earliest ? task.createdAt : earliest),
      now.toISOString(),
    );

    return {
      generatedAt: now.toISOString(),
      window: { from, to: now.toISOString() },
      metrics,
      failing,
      insufficientData: settled.length < MIN_SAMPLE,
    };
  }

  private completion(settled: readonly TaskReport[]): MetricValue {
    const done = settled.filter((task) => task.status === 'COMPLETED').length;
    return ratio('taskCompletion', done, settled.length);
  }

  /**
   * Answers that searched knowledge and came back with sources.
   *
   * A search that legitimately found nothing counts as grounded: TANIA said so
   * rather than inventing, which is the behaviour this metric should reward.
   */
  private groundedness(tasks: readonly TaskReport[]): MetricValue {
    const searched = tasks.filter((task) =>
      task.tools.some((tool) => tool.toolId === 'knowledge.search' && tool.status === 'SUCCEEDED'),
    );
    const grounded = searched.filter(
      (task) => task.evidence.length > 0 || task.result.includes('Tidak ada sumber'),
    ).length;

    return ratio('groundedness', grounded, searched.length);
  }

  /** Citations that point at something the task actually retrieved. */
  private citationAccuracy(tasks: readonly TaskReport[]): MetricValue {
    let cited = 0;
    let accurate = 0;

    for (const task of tasks) {
      const retrieved = new Set(task.evidence.map((item) => item.id));
      for (const item of task.evidence) {
        cited += 1;
        if (retrieved.has(item.id) && item.title.trim().length > 0) accurate += 1;
      }
    }

    return ratio('citationAccuracy', accurate, cited);
  }

  private retrievalQuality(tasks: readonly TaskReport[]): MetricValue {
    const searches = tasks.filter((task) =>
      task.tools.some((tool) => tool.toolId === 'knowledge.search'),
    );
    const useful = searches.filter((task) => task.evidence.length > 0).length;

    return ratio('retrievalQuality', useful, searches.length);
  }

  /** Tool calls that stayed inside what the agent declared and policy allowed. */
  private toolSelection(tasks: readonly TaskReport[]): MetricValue {
    let calls = 0;
    let sound = 0;

    for (const task of tasks) {
      for (const tool of task.tools) {
        calls += 1;
        if (tool.status !== 'BLOCKED') sound += 1;
      }
    }

    return ratio('toolSelection', sound, calls);
  }

  /**
   * Answers asserting something with nothing behind them.
   *
   * Deliberately narrow: it counts completed knowledge answers that produced
   * neither evidence nor an admission of having none. Broader definitions need
   * a judge model, and a metric nobody can reproduce is not a control.
   */
  private hallucinationRate(tasks: readonly TaskReport[]): MetricValue {
    const answered = tasks.filter(
      (task) =>
        task.status === 'COMPLETED' &&
        task.tools.some((tool) => tool.toolId === 'knowledge.search'),
    );
    const unsupported = answered.filter(
      (task) => task.evidence.length === 0 && !task.result.includes('Tidak ada sumber'),
    ).length;

    return ratio('hallucinationRate', unsupported, answered.length);
  }

  private latency(settled: readonly TaskReport[]): MetricValue {
    const durations = settled
      .map((task) => new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime())
      .filter((value) => Number.isFinite(value) && value >= 0);

    if (durations.length === 0) return evaluateMetric('latencyMs', 0, 0);

    const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    return evaluateMetric('latencyMs', Math.round(mean), durations.length);
  }

  private failureRate(settled: readonly TaskReport[]): MetricValue {
    const failed = settled.filter((task) => task.status !== 'COMPLETED').length;
    return ratio('failureRate', failed, settled.length);
  }
}

/**
 * A ratio, or an unmeasured metric.
 *
 * Zero observations yields `value: 0, sample: 0` — never a default of 1, which
 * would let "we did not measure this" render as a perfect score.
 */
function ratio(metric: EvaluationMetric, numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return evaluateMetric(metric, 0, 0);
  return evaluateMetric(metric, numerator / denominator, denominator);
}

/** How far outside its threshold a metric is, for ordering failures. */
function severity(metric: MetricValue): number {
  const definition = METRIC_DEFINITIONS[metric.metric];
  const distance = definition.lowerIsBetter
    ? metric.value - definition.threshold
    : definition.threshold - metric.value;

  return definition.unit === 'ms' ? distance / Math.max(1, definition.threshold) : distance;
}
