import type { RiskLevel } from '@tania/types';

/**
 * What the runtime can do, and what it costs to do it.
 *
 * The gap analysis called this the single tool manifest (M3): the runtime
 * publishes capabilities, the governance plane classifies them, and the Brain
 * plans on top. Before it existed, TANIA held a tool's risk in its own registry
 * and the runtime held the implementation, so the two could disagree about how
 * dangerous the same call was — and the one holding the implementation was not
 * the one deciding.
 *
 * `effect` and `reversible` are declared here because only the side that
 * performs the work can know them honestly.
 */
export interface ToolManifestEntry {
  toolId: string;
  name: string;
  description: string;
  /** Plain statement of what changes in the world. Shown to a human approver. */
  effect: string;
  /** True when `tools.compensate` can genuinely undo it. */
  reversible: boolean;
  /** The runtime's own assessment; the governance plane may raise it, never lower it. */
  defaultRisk: RiskLevel;
  /** Scopes an actor must hold. Enforced by TANIA; restated so the manifest is self-contained. */
  requiredScopes: string[];
}

/**
 * The tools this runtime actually implements.
 *
 * Deliberately small. A manifest that lists work the runtime cannot do is worse
 * than a short one: the Brain would plan against it and fail at execution, with
 * the failure landing on the user rather than on the deployment that overclaimed.
 */
export const TOOL_MANIFEST: readonly ToolManifestEntry[] = [
  {
    toolId: 'knowledge.search',
    name: 'Knowledge Search',
    description: 'Searches indexed enterprise knowledge and returns cited passages.',
    effect: 'Reads indexed knowledge. Nothing is modified.',
    reversible: false,
    defaultRisk: 'INFORMATIONAL',
    requiredScopes: ['knowledge:read'],
  },
  {
    toolId: 'enterprise.data',
    name: 'Enterprise Data',
    description: 'Runs a read-only query against a connected enterprise system.',
    effect: 'Reads enterprise records. Nothing is modified.',
    reversible: false,
    defaultRisk: 'LOW',
    requiredScopes: ['analytics:read'],
  },
  {
    toolId: 'analytics.query',
    name: 'Analytics Query',
    description: 'Runs a read-only query against the analytics mart.',
    effect: 'Reads aggregated metrics. Nothing is modified.',
    reversible: false,
    defaultRisk: 'LOW',
    requiredScopes: ['analytics:read'],
  },
  {
    toolId: 'document.draft',
    name: 'Document Draft',
    description: 'Creates a draft document in the runtime workspace.',
    effect: 'Creates a draft visible only to the requester until shared.',
    reversible: true,
    defaultRisk: 'MEDIUM',
    requiredScopes: ['document:create'],
  },
  {
    toolId: 'workflow.execute',
    name: 'Workflow Execute',
    description: 'Triggers a multi-step automation that changes enterprise state.',
    effect: 'Changes enterprise state across several systems.',
    reversible: true,
    defaultRisk: 'HIGH',
    requiredScopes: ['workflow:run'],
  },
];

export function findTool(toolId: string): ToolManifestEntry | undefined {
  return TOOL_MANIFEST.find((entry) => entry.toolId === toolId);
}
