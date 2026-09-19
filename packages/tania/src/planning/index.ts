/**
 * Planning domain — deciding which registered capabilities to use.
 *
 * A plan references tools by id only. A tool absent from the manifest cannot be
 * planned, which is what keeps a model from inventing a capability.
 */
import type { CapabilityStage, Intent, RiskLevel, ToolManifestEntry } from '@tania/types';
import type { RequestContext } from '../context/index.js';

export interface PlannedStep {
  id: string;
  toolId: string;
  /** Specialist agent that owns this step, when orchestration assigns one. */
  agentId?: string;
  stage: CapabilityStage;
  input: Record<string, unknown>;
  /** Short, user-safe label — never a chain of thought. */
  label: string;
}

export interface ExecutionPlan {
  planId: string;
  intent: Intent;
  steps: PlannedStep[];
  /** Highest risk among the planned steps, before policy evaluation. */
  estimatedRisk: RiskLevel;
}

export interface PlanInput {
  message: string;
  intent: Intent;
  context: RequestContext;
  /** Only capabilities the runtime actually published. */
  availableTools: ToolManifestEntry[];
}

export interface Planner {
  readonly id: string;
  plan(input: PlanInput): Promise<ExecutionPlan>;
}
