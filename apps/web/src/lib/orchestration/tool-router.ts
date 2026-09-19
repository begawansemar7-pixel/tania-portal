import type {
  Agent,
  TaskContext,
  ToolBinding,
  ToolInvocation,
  ToolRouter as ToolRouterPort,
} from '@tania/core/orchestration';
import type { PlannedAction } from '@tania/types';
import type { Actor } from '@/lib/identity/types';
import { evaluatePolicy } from '@/lib/tania/tools/policy';
import { findTool } from '@/lib/tania/tools/registry';
import type { ApprovalStore } from '@/lib/tania/approvals/store';
import type { JarvisRuntime } from '@/lib/tania/runtime/jarvis';
import type { KnowledgeRetriever } from '@/lib/tania/rag';
import { GovernedToolInvoker } from '@/lib/agents/base/governed-tool-invoker';
import type { ApprovalThreshold } from '@tania/types';

export interface ToolRouterDependencies {
  approvals: ApprovalStore;
  runtime: JarvisRuntime;
  retriever: KnowledgeRetriever;
  approvalThreshold: ApprovalThreshold;
  topK: number;
}

/**
 * Binds a planned action to something that can actually run it.
 *
 * Binding is where the governed invoker is created, so an action can only ever
 * be executed through the same four gates an agent faces: declared by the
 * agent, registered, permitted for the actor, and approved when heavy.
 */
export class GovernedToolRouter implements ToolRouterPort {
  readonly id = 'governed';

  constructor(private readonly deps: ToolRouterDependencies) {}

  available(agent: Agent, actor: Actor): string[] {
    return agent.requiredTools.filter((toolId) => {
      const decision = evaluatePolicy(toolId, actor, {
        approvalThreshold: this.deps.approvalThreshold,
      });
      return decision.allowed;
    });
  }

  bind(action: PlannedAction, context: TaskContext): ToolBinding | undefined {
    const tool = findTool(action.toolId);
    if (!tool) return undefined;

    const invoker = new GovernedToolInvoker({
      agent: context.agent,
      actor: context.actor,
      sessionId: context.sessionId,
      correlationId: context.correlationId,
      approvals: this.deps.approvals,
      runtime: this.deps.runtime,
      retriever: this.deps.retriever,
      approvalThreshold: this.deps.approvalThreshold,
      topK: this.deps.topK,
      question: context.question,
      ...(context.grantedApprovals === undefined
        ? {}
        : { grantedApprovals: context.grantedApprovals }),
    });

    const binding: ToolBinding = {
      actionId: action.id,
      toolId: action.toolId,
      invoke: (input) => invoker.invoke(action.toolId, input),
    };

    // Only promise a rollback the runtime can actually perform.
    if (tool.reversible && this.deps.runtime.compensate) {
      binding.compensate = async (): Promise<ToolInvocation> => {
        const result = await this.deps.runtime.compensate!({
          tool,
          input: { actionId: action.id, taskId: context.taskId },
          actor: context.actor,
          correlationId: context.correlationId,
        });

        return {
          toolId: action.toolId,
          name: tool.name,
          risk: tool.risk,
          status: result.status,
          summary: result.summary,
        };
      };
    }

    return binding;
  }
}
