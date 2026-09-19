import type { Actor } from '@/lib/identity/types';
import { RISK_LEVELS, type RiskLevel } from '@/lib/tania/types';
import { findTool, type ToolDefinition } from './registry';

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  tool?: ToolDefinition;
}

export interface PolicyOptions {
  /** Risk level from which approval becomes mandatory. */
  approvalThreshold: RiskLevel;
}

function riskRank(risk: RiskLevel): number {
  return RISK_LEVELS.indexOf(risk);
}

export function isAtLeast(risk: RiskLevel, threshold: RiskLevel): boolean {
  return riskRank(risk) >= riskRank(threshold);
}

/**
 * Least privilege: a tool runs only when it is registered, the actor holds
 * every required scope, and — above the risk threshold — a human approves.
 */
export function evaluatePolicy(
  toolId: string,
  actor: Actor,
  options: PolicyOptions,
): PolicyDecision {
  const tool = findTool(toolId);
  if (!tool) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Tool "${toolId}" is not registered in the tool registry.`,
    };
  }

  const missingScopes = tool.requiredScopes.filter(
    (scope) => !actor.scopes.includes(scope),
  );
  if (missingScopes.length > 0) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Missing required scope(s): ${missingScopes.join(', ')}.`,
      tool,
    };
  }

  if (isAtLeast(tool.risk, options.approvalThreshold)) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: `${tool.risk} risk action requires human approval before execution.`,
      tool,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason: `${tool.risk} risk action is permitted for this actor.`,
    tool,
  };
}
