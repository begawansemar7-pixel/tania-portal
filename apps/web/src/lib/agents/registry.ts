import type {
  Agent,
  AgentDefinition,
  AgentRegistry as AgentRegistryPort,
} from '@tania/core/orchestration';
import type { Intent } from '@tania/types';

/**
 * The catalogue of specialist agents.
 *
 * Registration is explicit: an agent exists for routing only if it was put
 * here, and it can only ever use the tools it declared. There is no discovery
 * mechanism that could add an agent at runtime.
 */
export class InMemoryAgentRegistry implements AgentRegistryPort {
  readonly id = 'memory';
  private readonly agents = new Map<string, Agent>();

  constructor(agents: readonly Agent[] = []) {
    for (const agent of agents) this.register(agent);
  }

  register(agent: Agent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agen dengan id "${agent.id}" sudah terdaftar.`);
    }
    this.agents.set(agent.id, agent);
  }

  list(): Agent[] {
    return [...this.agents.values()];
  }

  definitions(): AgentDefinition[] {
    return this.list().map((agent) => ({
      id: agent.id,
      name: agent.name,
      domain: agent.domain,
      description: agent.description,
      capabilities: agent.capabilities,
      requiredTools: agent.requiredTools,
      riskLevel: agent.riskLevel,
      status: agent.status,
      owner: agent.owner,
      stages: agent.stages,
    }));
  }

  find(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  forTool(toolId: string): Agent[] {
    return this.list().filter((agent) => agent.requiredTools.includes(toolId));
  }

  forIntent(intent: Intent): Agent[] {
    return this.list().filter((agent) =>
      agent.capabilities.some((capability) => capability.intents.includes(intent)),
    );
  }

  /** Agents eligible to receive work: retired and draft agents are excluded. */
  routable(): Agent[] {
    return this.list().filter((agent) => agent.status === 'ACTIVE' || agent.status === 'BETA');
  }
}
