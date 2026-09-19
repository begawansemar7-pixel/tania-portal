/**
 * @deprecated Superseded by the specialist agent registry in `lib/agents`.
 *
 * Kept as a thin projection so any remaining import keeps working: the agents
 * themselves — with their capabilities, tools, and risk ceilings — are defined
 * once, in `lib/agents`.
 */
import { createAgentStack } from '@/lib/agents';
import type { AgentDefinition } from '@tania/core/orchestration';

export type { AgentDefinition };

export const AGENT_REGISTRY: readonly AgentDefinition[] = createAgentStack().registry.definitions();

export function findAgent(agentId: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((agent) => agent.id === agentId);
}
