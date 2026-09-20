/**
 * The governance plane.
 *
 * Six concerns, one place. They were scattered before — policy beside the tool
 * registry, permissions inside the knowledge layer, audit inside the backend —
 * and scattered governance is governance nobody can review as a whole.
 *
 * Nothing here is a reimplementation: the policy engine and the permission
 * evaluator are the ones already in use, re-exported so the plane has a single
 * front door.
 */

// ── policies ─────────────────────────────────────────────────────────────────
export { evaluatePolicy } from '@/lib/tania/tools/policy';
export { TOOL_REGISTRY, findTool } from '@/lib/tania/tools/registry';
export type { ToolDefinition } from '@/lib/tania/tools/registry';
export {
  InProcessRateLimiter,
  limiterHealth,
  RATE_LIMITS,
  rateLimiter,
  RedisRateLimiter,
  ResilientRateLimiter,
  type LimiterState,
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitRule,
} from './policies/rate-limit';
export {
  assertSameOrigin,
  guardRequest,
  rateLimitHeaders,
  type GuardOptions,
} from './policies/request-guard';

// ── approvals ────────────────────────────────────────────────────────────────
export { InMemoryApprovalStore, type ApprovalStore } from '@/lib/tania/approvals/store';
export { HttpApprovalStore } from '@/lib/tania/approvals/http-store';

// ── permissions ──────────────────────────────────────────────────────────────
export { ClearanceAndAclEvaluator, visibilityFilter } from '@/lib/knowledge';
export { applyRoles, describeRole, resolveRoles, type RoleResolution } from './permissions/rbac';

// ── audit ────────────────────────────────────────────────────────────────────
export {
  GovernanceRecorder,
  InMemoryGovernanceSink,
  dataAccessOf,
  eventFromTask,
  type GovernanceSink,
} from './audit/recorder';

// ── data classification ──────────────────────────────────────────────────────
export { CLASSIFICATIONS, canAccessClassification } from '@tania/types';

// ── ai evaluation ────────────────────────────────────────────────────────────
export { TaskEvaluator, type EvaluationInput } from './ai-evaluation/evaluator';
