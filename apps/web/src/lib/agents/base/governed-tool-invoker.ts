import { randomUUID } from 'node:crypto';
import type { AgentDefinition, ToolInvocation, ToolInvoker } from '@tania/core/orchestration';
import { agentCanUseTool } from '@tania/core/orchestration';
import type { Actor } from '@/lib/identity/types';
import { logger } from '@/lib/logger';
import { evaluatePolicy } from '@/lib/tania/tools/policy';
import { findTool } from '@/lib/tania/tools/registry';
import type { ApprovalStore } from '@/lib/tania/approvals/store';
import type { JarvisRuntime } from '@/lib/tania/runtime/jarvis';
import type { KnowledgeRetriever } from '@/lib/tania/rag';
import type { ApprovalThreshold } from '@tania/types';

export interface GovernedToolInvokerDependencies {
  agent: AgentDefinition;
  actor: Actor;
  sessionId: string;
  correlationId: string;
  approvals: ApprovalStore;
  runtime: JarvisRuntime;
  retriever: KnowledgeRetriever;
  approvalThreshold: ApprovalThreshold;
  topK: number;
  /** Question being answered; retrieval tools use it as their query. */
  question: string;
  /** Cancels in-flight runtime calls when the caller walks away. */
  signal?: AbortSignal;
  /**
   * Approvals already granted for this task, keyed by tool id.
   *
   * Not a bypass: the invoker re-reads each one from the store and proceeds
   * only if it is genuinely `APPROVED` for that tool. It exists so a task that
   * was approved once does not open a second gate for the same action.
   */
  grantedApprovals?: Map<string, string>;
}

/**
 * The gate between an agent and everything else.
 *
 * Four checks run in a fixed order before anything happens: the agent declared
 * the tool, the tool is registered, the actor holds its scopes, and — above the
 * risk threshold — a human approved it. An agent cannot reorder or skip them,
 * because it never holds a reference to the runtime at all.
 */
export class GovernedToolInvoker implements ToolInvoker {
  /** Evidence gathered by retrieval tools during this task. */
  readonly evidence: Awaited<ReturnType<KnowledgeRetriever['search']>> = [];

  constructor(private readonly deps: GovernedToolInvokerDependencies) {}

  available(): string[] {
    return this.deps.agent.requiredTools.filter((toolId) => {
      const decision = evaluatePolicy(toolId, this.deps.actor, {
        approvalThreshold: this.deps.approvalThreshold,
      });
      return decision.allowed;
    });
  }

  async invoke(toolId: string, input: Record<string, unknown>): Promise<ToolInvocation> {
    let approvalId: string | undefined;

    // 1. The agent's own allow-list. A tool it never declared is not its to use.
    if (!agentCanUseTool(this.deps.agent, toolId)) {
      return blocked(toolId, `Tool ini tidak terdaftar pada agen ${this.deps.agent.name}.`);
    }

    // 2. The global registry. Nothing outside it can be executed at all.
    const tool = findTool(toolId);
    if (!tool) {
      return blocked(toolId, `Tool "${toolId}" tidak terdaftar di tool registry.`);
    }

    // 3. Policy: scopes, least privilege, and the risk threshold.
    const decision = evaluatePolicy(toolId, this.deps.actor, {
      approvalThreshold: this.deps.approvalThreshold,
    });

    if (!decision.allowed) {
      logger.info('agent.tool_denied', {
        correlationId: this.deps.correlationId,
        agentId: this.deps.agent.id,
        toolId,
        reason: decision.reason,
      });
      return {
        toolId,
        name: tool.name,
        risk: tool.risk,
        status: 'BLOCKED',
        summary: decision.reason,
      };
    }

    // 4. Human approval, when the action is heavy enough to need one.
    if (decision.requiresApproval) {
      const granted = this.deps.grantedApprovals?.get(toolId);
      if (granted) {
        const record = await this.deps.approvals.get(granted, this.deps.actor);

        if (record?.status === 'APPROVED' && record.toolId === toolId) {
          approvalId = granted;
          logger.audit('agent.approval_honoured', {
            correlationId: this.deps.correlationId,
            agentId: this.deps.agent.id,
            approvalId: granted,
            toolId,
          });
        } else {
          return {
            toolId,
            name: tool.name,
            risk: tool.risk,
            status: 'BLOCKED',
            summary: 'Persetujuan yang dirujuk tidak valid atau belum diberikan.',
          };
        }
      } else {
        const approval = await this.deps.approvals.save(
          {
            id: randomUUID(),
            sessionId: this.deps.sessionId,
            toolId,
            action: tool.name,
            risk: tool.risk,
            reason: decision.reason,
            requestedBy: this.deps.actor.id,
            requestedAt: new Date().toISOString(),
            status: 'PENDING',
          },
          this.deps.actor,
        );

        logger.audit('agent.approval_requested', {
          correlationId: this.deps.correlationId,
          agentId: this.deps.agent.id,
          approvalId: approval.id,
          toolId,
          risk: tool.risk,
        });

        return {
          toolId,
          name: tool.name,
          risk: tool.risk,
          status: 'AWAITING_APPROVAL',
          summary: decision.reason,
          approvalId: approval.id,
        };
      }
    }

    // Retrieval is served by the knowledge layer, not the runtime: it is a read
    // of indexed material, already filtered for this actor.
    if (toolId === 'knowledge.search') {
      const query = typeof input.query === 'string' ? input.query : this.deps.question;
      const evidence = await this.deps.retriever.search(
        { query, limit: this.deps.topK },
        this.deps.actor,
      );
      this.evidence.push(...evidence);

      return {
        toolId,
        name: tool.name,
        risk: tool.risk,
        status: 'SUCCEEDED',
        summary: `${evidence.length} dokumen relevan sesuai izin akses`,
        output: { evidence },
      };
    }

    const result = await this.deps.runtime.execute({
      tool,
      input,
      actor: this.deps.actor,
      correlationId: this.deps.correlationId,
      sessionId: this.deps.sessionId,
      requiresApproval: decision.requiresApproval,
      // Without this the runtime would reject its own approved command.
      ...(approvalId === undefined ? {} : { approvalId }),
      ...(this.deps.signal === undefined ? {} : { signal: this.deps.signal }),
    });

    // Sources the runtime can cite count as evidence like any other.
    if (result.evidence !== undefined) this.evidence.push(...result.evidence);

    return {
      toolId,
      name: tool.name,
      risk: tool.risk,
      status: result.status,
      summary: result.summary,
      ...(result.output === undefined && result.artifacts === undefined
        ? {}
        : {
            output: {
              ...result.output,
              ...(result.artifacts === undefined ? {} : { artifacts: result.artifacts }),
              ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
            },
          }),
    };
  }
}

function blocked(toolId: string, reason: string): ToolInvocation {
  return { toolId, name: toolId, risk: 'INFORMATIONAL', status: 'BLOCKED', summary: reason };
}
