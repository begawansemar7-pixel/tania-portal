import type { PlanRequest, Planner } from '@tania/core/orchestration';
import type { PlannedAction, RiskLevel } from '@tania/types';
import { RISK_CODE } from '@tania/types';
import { evaluatePolicy } from '@/lib/tania/tools/policy';
import { findTool } from '@/lib/tania/tools/registry';
import type { ApprovalThreshold } from '@tania/types';

const RISK_ORDER: RiskLevel[] = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface CapabilityPlannerOptions {
  approvalThreshold: ApprovalThreshold;
}

/**
 * Builds the plan from what the routed agent declared.
 *
 * Every step names a registered tool the agent is allowed to use; nothing is
 * invented. Steps the actor cannot use, or that exceed the task's risk cap, are
 * planned as BLOCKED rather than quietly dropped — a plan that hides what it
 * could not do is worse than one that says so.
 */
export class CapabilityPlanner implements Planner {
  readonly id = 'capability';

  constructor(private readonly options: CapabilityPlannerOptions) {}

  async plan(input: PlanRequest): Promise<PlannedAction[]> {
    const cap = input.maxRisk ?? input.agent.riskLevel;

    return input.agent.requiredTools.map((toolId, index) => {
      const tool = findTool(toolId);
      const id = `${input.taskId}-a${index + 1}`;

      if (!tool) {
        return {
          id,
          label: `Tool ${toolId} tidak terdaftar`,
          toolId,
          agentId: input.agent.id,
          risk: 'INFORMATIONAL' as RiskLevel,
          riskCode: RISK_CODE.INFORMATIONAL,
          status: 'BLOCKED' as const,
          reversible: false,
          detail: 'Tool tidak ada di registry sehingga tidak dapat direncanakan.',
        };
      }

      const decision = evaluatePolicy(toolId, input.actor, {
        approvalThreshold: this.options.approvalThreshold,
      });

      const aboveCap = RISK_ORDER.indexOf(tool.risk) > RISK_ORDER.indexOf(cap);
      const blocked = !decision.allowed || aboveCap;

      return {
        id,
        label: labelFor(tool.name, input.question),
        toolId,
        agentId: input.agent.id,
        risk: tool.risk,
        riskCode: RISK_CODE[tool.risk],
        status: blocked ? ('BLOCKED' as const) : ('PLANNED' as const),
        reversible: tool.reversible,
        detail: blocked
          ? aboveCap
            ? `Risiko ${RISK_CODE[tool.risk]} melebihi batas ${RISK_CODE[cap]} untuk tugas ini.`
            : decision.reason
          : tool.effect,
      };
    });
  }
}

function labelFor(toolName: string, question: string): string {
  const trimmed = question.length > 60 ? `${question.slice(0, 60)}…` : question;
  return `${toolName} untuk "${trimmed}"`;
}

/** Highest risk among the actions that may actually run. */
export function planRisk(actions: PlannedAction[]): RiskLevel {
  return actions
    .filter((action) => action.status !== 'BLOCKED')
    .reduce<RiskLevel>(
      (highest, action) =>
        RISK_ORDER.indexOf(action.risk) > RISK_ORDER.indexOf(highest) ? action.risk : highest,
      'INFORMATIONAL',
    );
}
