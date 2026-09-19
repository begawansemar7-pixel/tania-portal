import type { Agent } from '@tania/core/orchestration';
import { KnowledgeAgent } from './knowledge/knowledge-agent';
import { ResearchAgent } from './research/research-agent';
import { ProductAgent } from './product/product-agent';
import { SolutionAgent } from './solution/solution-agent';
import { MarketIntelligenceAgent } from './market-intelligence/market-intelligence-agent';
import { BusinessCaseAgent } from './business-case/business-case-agent';
import { DocumentationAgent } from './documentation/documentation-agent';
import { PerformanceAgent } from './performance/performance-agent';
import { AutomationAgent } from './automation/automation-agent';
import { InMemoryAgentRegistry } from './registry';
import { KeywordAgentRouter } from './router';

/**
 * The specialist agents TANIA ships with.
 *
 * Order is irrelevant to routing — it scores every routable agent — but the
 * list is explicit so adding an agent is a visible, reviewable change.
 */
export function createAgents(): Agent[] {
  return [
    new KnowledgeAgent(),
    new ResearchAgent(),
    new ProductAgent(),
    new SolutionAgent(),
    new MarketIntelligenceAgent(),
    new BusinessCaseAgent(),
    new DocumentationAgent(),
    new PerformanceAgent(),
    // The only agent that carries HIGH work, and so the only one whose plans
    // reach the human approval gate.
    new AutomationAgent(),
  ];
}

export interface AgentStack {
  registry: InMemoryAgentRegistry;
  router: KeywordAgentRouter;
}

export function createAgentStack(agents: Agent[] = createAgents()): AgentStack {
  const registry = new InMemoryAgentRegistry(agents);

  return {
    registry,
    // Knowledge is the fallback: read-only, INFORMATIONAL, and it cites.
    router: new KeywordAgentRouter(registry, { fallbackAgentId: 'agent.knowledge' }),
  };
}

export { InMemoryAgentRegistry } from './registry';
export { KeywordAgentRouter, matchesKeyword } from './router';
export { BaseAgent, describeInvocations } from './base/base-agent';
export { GovernedToolInvoker } from './base/governed-tool-invoker';
export { KnowledgeAgent } from './knowledge/knowledge-agent';
export { ResearchAgent } from './research/research-agent';
export { ProductAgent } from './product/product-agent';
export { SolutionAgent } from './solution/solution-agent';
export { MarketIntelligenceAgent } from './market-intelligence/market-intelligence-agent';
export { BusinessCaseAgent } from './business-case/business-case-agent';
export { DocumentationAgent } from './documentation/documentation-agent';
export { PerformanceAgent } from './performance/performance-agent';
export { AutomationAgent } from './automation/automation-agent';
