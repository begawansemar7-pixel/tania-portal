/**
 * Insight domain — noticing things nobody asked about.
 *
 * The constraint: a detector **observes and proposes**. It is given a snapshot
 * of what it may see and returns insights; it holds no tools, reaches no
 * systems, and cannot start work. That is what keeps proactivity from becoming
 * uncontrolled autonomous execution — there is no code path from a detector to
 * the runtime.
 */
import type { Insight } from '@tania/types';
import type { Actor } from '../identity/index.js';

/**
 * What detectors are allowed to look at.
 *
 * Passed in rather than fetched, so a detector cannot widen its own access:
 * whatever assembled this snapshot did so under the caller's permissions.
 */
export interface InsightContext {
  actor: Actor;
  /** When the scan runs, so "overdue" and "recent" mean something testable. */
  now: Date;
}

export interface InsightDetector<TInput = unknown> {
  readonly id: string;
  readonly kind: Insight['kind'];
  /** Returns what it noticed. An empty array is the normal case. */
  detect(input: TInput, context: InsightContext): Insight[] | Promise<Insight[]>;
}

/** Runs the detectors and keeps what they found. */
export interface InsightService {
  readonly id: string;
  /** Runs every detector and stores the results. */
  scan(context: InsightContext): Promise<Insight[]>;
  list(actor: Actor, options?: { limit?: number; includeDismissed?: boolean }): Promise<Insight[]>;
  dismiss(insightId: string, actor: Actor): Promise<Insight | undefined>;
}
