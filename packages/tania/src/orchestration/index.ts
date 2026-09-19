/**
 * Orchestration domain — routing work to specialist agents.
 *
 * The constraint that shapes every type here: an agent is not autonomous. It
 * declares the tools it may use, carries a risk ceiling, and reaches the world
 * only through a `ToolInvoker` that applies policy and approval. An agent that
 * could call anything would be a second, ungoverned path into enterprise
 * systems — exactly what the governance plane exists to prevent.
 */
import type {
  CapabilityStage,
  Evidence,
  TaskArtifact,
  Intent,
  PlannedAction,
  RiskLevel,
  TaskReport,
  TaskRequest,
  TaskState,
  TaskVerification,
  ToolUsage,
  TraceStep,
} from '@tania/types';
import type { Actor } from '../identity/index.js';
import type { RequestContext } from '../context/index.js';
import type { ExecutionPlan } from '../planning/index.js';

export const AGENT_STATUSES = ['ACTIVE', 'BETA', 'DRAFT', 'RETIRED'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** One thing an agent knows how to do, and the language that routes to it. */
export interface AgentCapability {
  id: string;
  label: string;
  /** Intents this capability answers. */
  intents: Intent[];
  /** Routing vocabulary. Matched case-insensitively against the request. */
  keywords: string[];
  stage: CapabilityStage;
}

/** Declarative description of an agent, safe to render and to store. */
export interface AgentDefinition {
  id: string;
  name: string;
  domain: string;
  description: string;
  capabilities: AgentCapability[];
  /** Allow-list of tool ids. Anything outside it is unavailable, by contract. */
  requiredTools: string[];
  /** Ceiling: the agent may never carry work above this level. */
  riskLevel: RiskLevel;
  status: AgentStatus;
  owner: string;
  stages: CapabilityStage[];
}

// ── Execution ────────────────────────────────────────────────────────────────

export interface ToolInvocation {
  toolId: string;
  name: string;
  risk: RiskLevel;
  status: 'SUCCEEDED' | 'FAILED' | 'AWAITING_APPROVAL' | 'BLOCKED';
  summary: string;
  output?: Record<string, unknown>;
  /** Present when the call stopped at a human approval gate. */
  approvalId?: string;
}

/**
 * The only way an agent touches anything.
 *
 * Implementations run the registry check, the policy evaluation, the approval
 * gate, and the runtime call — in that order — so an agent cannot skip a step
 * by construction rather than by convention.
 */
export interface ToolInvoker {
  /** Tool ids this invoker will accept for the current agent and actor. */
  available(): string[];
  invoke(toolId: string, input: Record<string, unknown>): Promise<ToolInvocation>;
}

export interface AgentTask {
  taskId: string;
  agentId: string;
  /** The user's request, verbatim. */
  question: string;
  intent: Intent;
  context: RequestContext;
  plan?: ExecutionPlan;
}

export interface AgentExecution {
  taskId: string;
  agentId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'AWAITING_APPROVAL' | 'BLOCKED';
  /** User-facing summary of what the agent did. Never chain-of-thought. */
  summary: string;
  toolsUsed: ToolUsage[];
  trace: TraceStep[];
  evidence: Evidence[];
  approvalId?: string;
}

export interface AgentVerification {
  ok: boolean;
  /** User-safe findings, e.g. "tidak ada sumber yang dikutip". */
  issues: string[];
  checkedAt: string;
}

/**
 * A specialist agent.
 *
 * `execute` does the work through the injected invoker; `verify` checks its own
 * output against what it claimed to do, so a failure is reported rather than
 * presented as success.
 */
export interface Agent extends AgentDefinition {
  execute(task: AgentTask, tools: ToolInvoker): Promise<AgentExecution>;
  verify(execution: AgentExecution): Promise<AgentVerification>;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export interface AgentRegistry {
  readonly id: string;
  list(): Agent[];
  definitions(): AgentDefinition[];
  find(agentId: string): Agent | undefined;
  /** Agents that declare the given tool. */
  forTool(toolId: string): Agent[];
  /** Agents with a capability answering the given intent. */
  forIntent(intent: Intent): Agent[];
  register(agent: Agent): void;
}

// ── Routing ──────────────────────────────────────────────────────────────────

export interface RoutingRequest {
  message: string;
  intent: Intent;
  actor: Actor;
  /** Restricts routing to agents whose tools are all currently permitted. */
  permittedTools?: string[];
}

export interface RoutingCandidate {
  agentId: string;
  name: string;
  score: number;
  /** Capability keywords that matched, shown as the reason for the choice. */
  matched: string[];
}

export interface RoutingDecision {
  agent: Agent;
  intent: Intent;
  /** 0–1. Low confidence means the fallback carried the request. */
  confidence: number;
  /** User-safe explanation of why this agent was chosen. */
  rationale: string;
  /** Tools the agent may use for this request, after permission filtering. */
  toolPlan: string[];
  alternatives: RoutingCandidate[];
  /** True when no agent matched and the default handled the request. */
  fallback: boolean;
}

export interface AgentRouter {
  readonly id: string;
  route(request: RoutingRequest): RoutingDecision;
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Turns a request into an ordered plan of controlled actions.
 *
 * The planner never invents a capability: every step names a tool from the
 * registry that the routed agent declared and the actor may use.
 */
export interface Planner {
  readonly id: string;
  plan(input: PlanRequest): Promise<PlannedAction[]>;
}

export interface PlanRequest {
  taskId: string;
  question: string;
  intent: Intent;
  agent: Agent;
  actor: Actor;
  /** Caps plan risk below what the agent or actor would otherwise allow. */
  maxRisk?: RiskLevel;
}

/**
 * Binds a planned action to a concrete, permitted tool call.
 *
 * Separate from execution on purpose: selection is a decision that can be
 * inspected before anything runs.
 */
export interface ToolRouter {
  readonly id: string;
  /** Tool ids currently usable for this agent and actor. */
  available(agent: Agent, actor: Actor): string[];
  bind(action: PlannedAction, context: TaskContext): ToolBinding | undefined;
}

export interface ToolBinding {
  actionId: string;
  toolId: string;
  invoke: (input: Record<string, unknown>) => Promise<ToolInvocation>;
  /** Undoes a completed step, when the runtime supports it. */
  compensate?: () => Promise<ToolInvocation>;
}

export interface TaskContext {
  taskId: string;
  sessionId: string;
  correlationId: string;
  actor: Actor;
  agent: Agent;
  question: string;
  intent: Intent;
  /** True when the request asked for an artifact, not just an answer. */
  wantsArtifact?: boolean;
  /**
   * Approvals already granted for this task, keyed by tool id.
   *
   * Carried so a resumed task does not open a second gate for an action a human
   * already decided. Each one is re-read from the store before it is honoured.
   */
  grantedApprovals?: Map<string, string>;
}

export interface ExecutionOutcome {
  actions: PlannedAction[];
  tools: ToolUsage[];
  trace: TraceStep[];
  evidence: Evidence[];
  /** Anything the run produced, lifted out of the tool results. */
  artifacts: TaskArtifact[];
  errors: TaskErrorLike[];
  /** Set when execution stopped at a gate. */
  pendingApprovalId?: string;
  status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'AWAITING_APPROVAL' | 'CANCELLED';
}

export interface TaskErrorLike {
  code: string;
  message: string;
  actionId?: string;
  recoverable: boolean;
}

/**
 * Runs the plan.
 *
 * Owns retry of transient failures and compensation of completed reversible
 * steps when a later required step fails — the difference between a task that
 * half-happened and one that was undone.
 */
export interface ExecutionManager {
  readonly id: string;
  run(actions: PlannedAction[], context: TaskContext): Promise<ExecutionOutcome>;
  /** Undoes completed reversible actions, newest first. */
  compensate(actions: PlannedAction[], context: TaskContext): Promise<PlannedAction[]>;
}

/** Decides whether what happened matches what was promised. */
export interface VerificationManager {
  readonly id: string;
  verify(input: VerificationInput): Promise<TaskVerification>;
}

export interface VerificationInput {
  context: TaskContext;
  outcome: ExecutionOutcome;
  /** When true, a run that produced no artifact has not done what was asked. */
  wantsArtifact?: boolean;
}

/** Owns the human decision gate for L3 and L4 actions. */
export interface ApprovalManager {
  readonly id: string;
  /** Actions that may not run without a decision. */
  gatedActions(actions: PlannedAction[]): PlannedAction[];
  request(action: PlannedAction, context: TaskContext): Promise<string>;
  status(approvalId: string, actor: Actor): Promise<'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'>;
}

/**
 * Drives the task lifecycle.
 *
 * REQUESTED → UNDERSTANDING → PLANNING → [APPROVAL] → EXECUTING → VERIFYING →
 * REPORTING → REMEMBERING → COMPLETED | FAILED | BLOCKED | CANCELLED.
 */
export interface Orchestrator {
  readonly id: string;
  start(request: TaskRequest, actor: Actor, correlationId: string): Promise<TaskReport>;
  /** Continues a task parked at an approval gate. */
  resume(taskId: string, actor: Actor, correlationId: string): Promise<TaskReport>;
  cancel(taskId: string, actor: Actor, reason: string): Promise<TaskReport>;
  get(taskId: string, actor: Actor): Promise<TaskReport | undefined>;
}

/** Persistence for task records. */
/**
 * Where tasks live between requests.
 *
 * Every method takes the whole `Actor`, not an id. A durable implementation has
 * to prove *who* is asking to the service that holds the rows, and an id alone
 * cannot do that — it would have to invent the rest, which is how a store ends
 * up reading one principal's rows while writing another's.
 */
export interface TaskStore {
  readonly id: string;
  save(report: TaskReport, actor: Actor): Promise<void>;
  get(taskId: string, actor: Actor): Promise<TaskReport | undefined>;
  list(actor: Actor, limit: number): Promise<TaskReport[]>;
  /**
   * The task an approval belongs to, if any.
   *
   * Without this, a human deciding a task's gate on the approvals screen would
   * have the action executed by the conversational path *and* again when the
   * task resumes.
   */
  findByApproval(approvalId: string, actor: Actor): Promise<TaskReport | undefined>;
}

export interface LegacyOrchestrator {
  readonly id: string;
  execute(task: AgentTask): Promise<AgentExecution>;
}

/**
 * Allowed transitions. Anything outside this table is a programming error.
 *
 * Every ending funnels through REPORTING and REMEMBERING: a task that failed,
 * was blocked, or was cancelled is still reported and still remembered. That is
 * why no state jumps straight to a terminal one — only REMEMBERING does. The
 * outcome is *decided* earlier (the moment execution or a human settles it) and
 * *applied* last, so a task is never marked COMPLETED before its result exists.
 */
export const TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  REQUESTED: ['UNDERSTANDING', 'REPORTING'],
  UNDERSTANDING: ['PLANNING', 'REPORTING'],
  PLANNING: ['APPROVAL', 'EXECUTING', 'REPORTING'],
  // A gate may be re-entered: a plan can need a second decision.
  APPROVAL: ['APPROVAL', 'EXECUTING', 'REPORTING'],
  EXECUTING: ['VERIFYING', 'APPROVAL', 'REPORTING'],
  VERIFYING: ['REPORTING'],
  REPORTING: ['REMEMBERING'],
  REMEMBERING: ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: [],
  CANCELLED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

// ── Guards ───────────────────────────────────────────────────────────────────

/** An agent may only be handed a tool it declared. */
export function agentCanUseTool(agent: AgentDefinition, toolId: string): boolean {
  return agent.requiredTools.includes(toolId);
}

const RISK_ORDER: RiskLevel[] = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** An agent may not be handed work above its declared ceiling. */
export function agentAcceptsRisk(agent: AgentDefinition, risk: RiskLevel): boolean {
  return RISK_ORDER.indexOf(risk) <= RISK_ORDER.indexOf(agent.riskLevel);
}
