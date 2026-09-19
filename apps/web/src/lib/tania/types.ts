/**
 * Domain types for the portal.
 *
 * These are re-exports: the canonical definitions live in `@tania/types`
 * (wire shapes) and `@tania/core` (domain ports), so the portal, the API, and
 * any future service describe the same thing with the same words.
 */
export {
  RISK_LEVELS,
  CAPABILITY_STAGES,
  TRACE_STATUSES,
  CLASSIFICATIONS,
  INTENTS,
  APPROVAL_STATUSES,
  highestRisk,
  isAtLeastRisk,
  canAccessClassification,
  type ApprovalRequest,
  type ApprovalStatus,
  type ApprovalThreshold,
  type AskRequest,
  type AskResponse,
  type CapabilityStage,
  type Classification,
  type Evidence,
  type Intent,
  type RiskLevel,
  type ToolExecutionResult,
  type ToolManifestEntry,
  type ToolUsage,
  type TraceStatus,
  type TraceStep,
} from '@tania/types';

/** Risk level from which a human approval gate is mandatory by default. */
export const APPROVAL_REQUIRED_FROM = 'HIGH' as const;
