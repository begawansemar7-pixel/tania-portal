/**
 * Task lifecycle contract for the agent orchestrator.
 *
 * The shape here is deliberately the *whole* public surface of a task. What a
 * caller may see is fixed by this file: current status, planned actions, tools
 * used, evidence, result, and errors. Intermediate deliberation is not modelled
 * because it is never produced, stored, or emitted.
 */
import type { CapabilityCategory } from './capability.js';
import type { Evidence } from './evidence.js';
import type { Intent } from './intent.js';
import type { RiskLevel } from './risk.js';
import type { ToolUsage } from './tool.js';
import type { TraceStep } from './trace.js';

export const TASK_STATES = [
  'REQUESTED',
  'UNDERSTANDING',
  'PLANNING',
  'APPROVAL',
  'EXECUTING',
  'VERIFYING',
  'REPORTING',
  'REMEMBERING',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'CANCELLED',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/** States a task can end in. Nothing runs after one of these is reached. */
export const TERMINAL_TASK_STATES = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'] as const;

export type TerminalTaskState = (typeof TERMINAL_TASK_STATES)[number];

export function isTerminalTaskState(state: TaskState): state is TerminalTaskState {
  return (TERMINAL_TASK_STATES as readonly string[]).includes(state);
}

/** Short codes used in reports and operations conversations. */
export const RISK_CODE: Record<RiskLevel, string> = {
  INFORMATIONAL: 'L0',
  LOW: 'L1',
  MEDIUM: 'L2',
  HIGH: 'L3',
  CRITICAL: 'L4',
};

/** L3 and L4 never run without an explicit human decision. */
export const APPROVAL_REQUIRED_CODES = ['L3', 'L4'] as const;

export function riskCode(risk: RiskLevel): string {
  return RISK_CODE[risk];
}

export function requiresHumanApproval(risk: RiskLevel): boolean {
  return (APPROVAL_REQUIRED_CODES as readonly string[]).includes(RISK_CODE[risk]);
}

export const PLANNED_ACTION_STATUSES = [
  'PLANNED',
  'AWAITING_APPROVAL',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'BLOCKED',
  'SKIPPED',
  'COMPENSATED',
] as const;

export type PlannedActionStatus = (typeof PLANNED_ACTION_STATUSES)[number];

/** One step of the plan, as the user may see it. */
export interface PlannedAction {
  id: string;
  /** User-safe description of the step, e.g. "Membaca metrik delivery". */
  label: string;
  toolId: string;
  agentId: string;
  risk: RiskLevel;
  /** L0–L4. */
  riskCode: string;
  status: PlannedActionStatus;
  /** Whether the runtime can undo this step if a later one fails. */
  reversible: boolean;
  /** Attempts made, including the first. */
  attempts?: number;
  approvalId?: string;
  detail?: string;
}

/**
 * Something a task produced: a summary, a draft, an export.
 *
 * Modelled on the task rather than left inside a tool result because an
 * artifact outlives the step that made it — it is what the person asked for,
 * and it has to be findable, verifiable, and attributable afterwards.
 */
export interface TaskArtifact {
  id: string;
  kind: 'document' | 'summary' | 'dataset' | 'image' | 'other';
  title: string;
  mediaType: string;
  /** Inline content, for text small enough to carry. */
  content?: string;
  /** Where it lives, when the runtime stored it rather than returning it. */
  uri?: string;
  /** Tool that produced it, so provenance is never guessed. */
  producedBy: string;
  createdAt: string;
  /** Set once verification has looked at it. */
  verified?: boolean;
  /** User-safe findings from verification. */
  issues?: string[];
}

export interface TaskVerification {
  ok: boolean;
  /** User-safe findings; never a rationale for a model decision. */
  issues: string[];
  checkedAt: string;
}

export interface TaskError {
  code: string;
  message: string;
  /** Planned action this error belongs to, when it came from a step. */
  actionId?: string;
  /** True when a retry could plausibly succeed. */
  recoverable: boolean;
}

/**
 * The execution trace of a task — the whole record a caller receives.
 *
 * Matches the agreed report shape: taskId, intent, plan, agents, tools, status,
 * evidence, verification, result.
 */
export interface TaskReport {
  taskId: string;
  /** Conversation this task belongs to; approvals and audit hang off it. */
  sessionId: string;
  /** The request, verbatim, so a report explains itself. */
  question: string;
  intent: Intent;
  status: TaskState;
  /** Planned actions, in order, with their outcome. */
  plan: PlannedAction[];
  /** Agents involved, most responsible first. */
  agents: string[];
  /** Tools actually invoked. */
  tools: ToolUsage[];
  evidence: Evidence[];
  /** What the task produced, if anything. */
  artifacts: TaskArtifact[];
  /** What kind of work this was, by the most consequential thing it did. */
  category?: CapabilityCategory;
  verification: TaskVerification;
  /** Final answer or summary. Empty while the task is still running. */
  result: string;
  errors: TaskError[];
  /** Safe execution status per step, ordered. */
  trace: TraceStep[];
  /** Highest risk in the plan. */
  risk: RiskLevel;
  riskCode: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the task is parked waiting for a human decision. */
  pendingApprovalId?: string;
  /** True when the request asked for an artifact, not just an answer. */
  wantsArtifact?: boolean;
}

export interface TaskRequest {
  question: string;
  sessionId: string;
  intent?: Intent;
  /** Caps the risk this task may reach, below the actor's own limits. */
  maxRisk?: RiskLevel;
  /**
   * Asks the task to produce an artifact, not just an answer.
   *
   * Explicit because producing a document is real work with a real cost, and
   * guessing that a question wanted one would fill a person's workspace with
   * drafts they never asked for.
   */
  wantsArtifact?: boolean;
}

/** How a task is grouped in My Work. */
export const WORK_GROUPS = ['IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED'] as const;

export type WorkGroup = (typeof WORK_GROUPS)[number];

/**
 * Which tray a task belongs in.
 *
 * `BLOCKED` and `CANCELLED` sit with `FAILED` rather than getting trays of
 * their own: from the person's side they are all "this did not happen", and
 * the reason is on the task itself.
 */
export function workGroupFor(state: TaskState): WorkGroup {
  switch (state) {
    case 'APPROVAL':
      return 'PENDING_APPROVAL';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
    case 'BLOCKED':
    case 'CANCELLED':
      return 'FAILED';
    default:
      return 'IN_PROGRESS';
  }
}

export const WORK_GROUP_LABELS: Record<WorkGroup, string> = {
  IN_PROGRESS: 'Sedang berjalan',
  PENDING_APPROVAL: 'Menunggu persetujuan',
  COMPLETED: 'Selesai',
  FAILED: 'Gagal',
};
