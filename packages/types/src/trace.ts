/**
 * Execution trace.
 *
 * Governance rule: a trace carries safe execution status only — what ran, on
 * which tool, with what outcome. Hidden reasoning is never modelled, stored,
 * or rendered.
 */

export const CAPABILITY_STAGES = [
  'KNOW',
  'UNDERSTAND',
  'REASON',
  'PLAN',
  'CREATE',
  'ACT',
  'VERIFY',
  'LEARN',
] as const;

export type CapabilityStage = (typeof CAPABILITY_STAGES)[number];

export const TRACE_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'AWAITING_APPROVAL',
  'BLOCKED',
] as const;

export type TraceStatus = (typeof TRACE_STATUSES)[number];

export interface TraceStep {
  id: string;
  label: string;
  stage: CapabilityStage;
  status: TraceStatus;
  toolId?: string;
  detail?: string;
  durationMs?: number;
}

export function isTerminalTraceStatus(status: TraceStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'BLOCKED';
}
