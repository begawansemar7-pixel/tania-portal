/**
 * Governance domain — the plane every action passes through.
 *
 * Tool registry, policy, approval, and audit are separate ports on purpose: a
 * deployment may swap the policy engine without touching how approvals are
 * stored, and the audit sink is append-only by contract.
 */
import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStatus,
  ApprovalThreshold,
  ExecutionStatus,
  RiskLevel,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolManifestEntry,
} from '@tania/types';
import { isAtLeastRisk } from '@tania/types';
import type { Actor, Scope } from '../identity/index.js';

// ── Tool registry ────────────────────────────────────────────────────────────

/** A registered capability. Nothing outside the registry can be executed. */
export type ToolDefinition = ToolManifestEntry;

export interface ToolRegistry {
  readonly id: string;
  list(): ToolDefinition[];
  find(toolId: string): ToolDefinition | undefined;
  /** Replaces the manifest published by a runtime. */
  publish(tools: ToolDefinition[], source: string): Promise<void>;
}

// ── Policy ───────────────────────────────────────────────────────────────────

export interface PolicyContext {
  /** Risk level from which a human decision becomes mandatory. */
  approvalThreshold: ApprovalThreshold;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  /** User-safe explanation, shown in the approval gate and the audit trail. */
  reason: string;
  risk: RiskLevel;
  missingScopes?: Scope[];
  tool?: ToolDefinition;
}

export interface PolicyEngine {
  readonly id: string;
  evaluate(toolId: string, actor: Actor, context: PolicyContext): PolicyDecision;
}

/**
 * Risk may be raised by governance, never lowered below what the runtime
 * declared — a runtime knows its own blast radius better than a caller does.
 */
export interface RiskClassifier {
  readonly id: string;
  classify(tool: ToolDefinition, actor: Actor): RiskLevel;
}

export function requiresApproval(risk: RiskLevel, threshold: ApprovalThreshold): boolean {
  return isAtLeastRisk(risk, threshold);
}

// ── Approval ─────────────────────────────────────────────────────────────────

export interface ApprovalCreate {
  id?: string;
  sessionId: string;
  messageId?: string;
  toolId: string;
  action: string;
  risk: RiskLevel;
  reason: string;
  effect?: string;
}

export interface ApprovalQuery {
  status?: ApprovalStatus;
  sessionId?: string;
  limit: number;
}

export interface ExecutionOutcome {
  status: Extract<ExecutionStatus, 'SUCCEEDED' | 'FAILED'>;
  summary: string;
}

/**
 * Durable gate for high-risk actions.
 *
 * Fail-closed: when a decision cannot be persisted, the action does not run.
 * An implementation must reject a second decision on an already decided gate.
 */
export interface ApprovalService {
  readonly id: string;
  /** True when decisions survive a restart. */
  readonly durable: boolean;
  request(input: ApprovalCreate, actor: Actor): Promise<ApprovalRequest>;
  get(approvalId: string, actor: Actor): Promise<ApprovalRequest | undefined>;
  list(query: ApprovalQuery, actor: Actor): Promise<ApprovalRequest[]>;
  decide(approvalId: string, decision: ApprovalDecision, actor: Actor): Promise<ApprovalRequest>;
  recordExecution(approvalId: string, outcome: ExecutionOutcome, actor: Actor): Promise<void>;
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEventInput {
  event: string;
  actorId?: string;
  sessionId?: string;
  approvalId?: string;
  risk?: RiskLevel;
  payload: Record<string, unknown>;
}

export interface AuditEventRecord extends AuditEventInput {
  id: string;
  /** Monotonic position in the chain, as a string to survive JSON. */
  sequence: string;
  occurredAt: string;
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  ok: boolean;
  count: number;
  brokenAtSequence?: string;
  checkedAt: string;
}

/** Append-only by contract: no update, no delete. */
export interface AuditSink {
  readonly id: string;
  append(event: AuditEventInput): Promise<AuditEventRecord>;
  verify(): Promise<ChainVerification>;
}

// ── Runtime execution ────────────────────────────────────────────────────────

/**
 * The only way into enterprise systems. TANIA never calls them directly; the
 * runtime owns execution, local confirmation, and compensation.
 */
export interface RuntimeGateway {
  readonly id: string;
  manifest(): Promise<ToolDefinition[]>;
  execute(request: ToolExecutionRequest, actor: Actor): Promise<ToolExecutionResult>;
}
