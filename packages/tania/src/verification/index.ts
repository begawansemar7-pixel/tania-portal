/**
 * Verification domain — checking what was produced against what was asked.
 *
 * A trace records safe execution status only: which step ran, on which tool,
 * with which outcome. Model reasoning is never captured here.
 */
import type { CapabilityStage, Evidence, TraceStatus, TraceStep } from '@tania/types';

export interface VerificationInput {
  answer: string;
  evidence: Evidence[];
  /** Ids the reasoner claims to have relied on. */
  groundedIn?: string[];
}

export interface VerificationOutcome {
  /** True when every claim-bearing answer is backed by cited evidence. */
  grounded: boolean;
  status: TraceStatus;
  /** User-safe findings, e.g. "no enterprise source was available". */
  issues: string[];
}

export interface Verifier {
  readonly id: string;
  verify(input: VerificationInput): Promise<VerificationOutcome> | VerificationOutcome;
}

/** Collects trace steps for one turn. */
export interface TraceRecorder {
  record(step: TraceStep): void;
  steps(): TraceStep[];
}

export interface TraceSummary {
  total: number;
  byStatus: Record<TraceStatus, number>;
  stages: CapabilityStage[];
  totalDurationMs: number;
}

export function summariseTrace(steps: readonly TraceStep[]): TraceSummary {
  const byStatus = {
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    AWAITING_APPROVAL: 0,
    BLOCKED: 0,
  } satisfies Record<TraceStatus, number>;

  const stages: CapabilityStage[] = [];
  let totalDurationMs = 0;

  for (const step of steps) {
    byStatus[step.status] += 1;
    totalDurationMs += step.durationMs ?? 0;
    if (!stages.includes(step.stage)) stages.push(step.stage);
  }

  return { total: steps.length, byStatus, stages, totalDurationMs };
}
