import { config } from '@/lib/config/env';
import type { IntentService } from '@/lib/tania/services/intent-service';
import type { ApprovalStore } from '@/lib/tania/approvals/store';
import type { JarvisRuntime } from '@/lib/tania/runtime/jarvis';
import type { KnowledgeRetriever } from '@/lib/tania/rag';
import type { AgentStack } from '@/lib/agents';
import { CapabilityPlanner } from './planner';
import { GovernedToolRouter } from './tool-router';
import { RetryingExecutionManager } from './execution-manager';
import { PlanVerificationManager } from './verification-manager';
import { StoreApprovalManager } from './approval-manager';
import { InMemoryTaskStore } from './task-store';
import type { TaskStore } from '@tania/core/orchestration';
import type { MemoryStore } from '@tania/core/memory';
import { InMemoryMemoryStore } from './memory-store';
import { TaskOrchestrator } from './orchestrator';

export interface OrchestrationStackOptions {
  agents: AgentStack;
  intents: IntentService;
  approvals: ApprovalStore;
  runtime: JarvisRuntime;
  retriever: KnowledgeRetriever;
  /** Durable task store; falls back to process memory when absent. */
  tasks?: TaskStore;
  /** Durable memory store; falls back to process memory when absent. */
  memory?: MemoryStore;
}

export interface OrchestrationStack {
  orchestrator: TaskOrchestrator;
  /** The port, not the in-memory class: a deployment may be using either. */
  tasks: TaskStore;
  memory: MemoryStore;
}

/**
 * Assembles the orchestrator from its parts.
 *
 * Each manager is injected, so a deployment can swap durable task storage,
 * real memory, or a different execution strategy without touching the
 * lifecycle itself.
 */
export function createOrchestrationStack(
  options: OrchestrationStackOptions,
): OrchestrationStack {
  const approvalThreshold = config.governance.approvalThreshold;

  const toolRouter = new GovernedToolRouter({
    approvals: options.approvals,
    runtime: options.runtime,
    retriever: options.retriever,
    approvalThreshold,
    topK: config.rag.topK,
  });

  // Durable when a backend is configured; process-local otherwise. The caller
  // decides, because only the composition root knows whether one exists.
  const tasks = options.tasks ?? new InMemoryTaskStore();
  const memory = options.memory ?? new InMemoryMemoryStore();

  const orchestrator = new TaskOrchestrator({
    intents: options.intents,
    router: options.agents.router,
    registry: options.agents.registry,
    planner: new CapabilityPlanner({ approvalThreshold }),
    execution: new RetryingExecutionManager(toolRouter),
    verification: new PlanVerificationManager(),
    approvals: new StoreApprovalManager(options.approvals),
    tasks,
    memory,
  });

  return { orchestrator, tasks, memory };
}

export { TaskOrchestrator, composeResult } from './orchestrator';
export { CapabilityPlanner, planRisk } from './planner';
export { GovernedToolRouter } from './tool-router';
export { RetryingExecutionManager } from './execution-manager';
export { PlanVerificationManager } from './verification-manager';
export { StoreApprovalManager } from './approval-manager';
export { InMemoryTaskStore } from './task-store';
export { InMemoryMemoryStore } from './memory-store';
