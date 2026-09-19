import type {
  Agent,
  AgentCapability,
  AgentExecution,
  AgentStatus,
  AgentTask,
  AgentVerification,
  ToolInvocation,
  ToolInvoker,
} from '@tania/core/orchestration';
import type { CapabilityStage, Evidence, RiskLevel, ToolUsage, TraceStep } from '@tania/types';

/** One tool call an agent intends to make, described before it runs. */
export interface ToolStep {
  toolId: string;
  /** User-safe label shown in the execution trace. */
  label: string;
  stage: CapabilityStage;
  input: (task: AgentTask) => Record<string, unknown>;
  /** When false, a blocked or failed step does not stop the agent. */
  required?: boolean;
}

export interface AgentSummaryInput {
  task: AgentTask;
  invocations: ToolInvocation[];
  evidence: Evidence[];
}

/**
 * Shared machinery for specialist agents.
 *
 * Subclasses declare *what* they do — capabilities, the tools they may use, and
 * the steps for a task. The loop here does the rest identically for every
 * agent: run each step through the invoker, record a trace, and stop the moment
 * a required step is blocked or parked at an approval gate. Nothing proceeds
 * past a gate on its own.
 */
export abstract class BaseAgent implements Agent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly domain: string;
  abstract readonly description: string;
  abstract readonly capabilities: AgentCapability[];
  abstract readonly requiredTools: string[];
  abstract readonly riskLevel: RiskLevel;
  abstract readonly status: AgentStatus;
  abstract readonly owner: string;

  get stages(): CapabilityStage[] {
    return [...new Set(this.capabilities.map((capability) => capability.stage))];
  }

  /** The tool calls this agent makes for a task, in order. */
  protected abstract steps(task: AgentTask): ToolStep[];

  /** The user-facing account of what was produced. */
  protected abstract summarize(input: AgentSummaryInput): string;

  async execute(task: AgentTask, tools: ToolInvoker): Promise<AgentExecution> {
    const trace: TraceStep[] = [];
    const toolsUsed: ToolUsage[] = [];
    const invocations: ToolInvocation[] = [];
    const evidence: Evidence[] = [];

    let status: AgentExecution['status'] = 'SUCCEEDED';
    let approvalId: string | undefined;

    for (const step of this.steps(task)) {
      const startedAt = Date.now();
      const invocation = await tools.invoke(step.toolId, step.input(task));
      invocations.push(invocation);

      trace.push({
        id: `${task.taskId}-${step.toolId}`,
        label: step.label,
        stage: step.stage,
        status: invocation.status,
        toolId: step.toolId,
        detail: invocation.summary,
        durationMs: Date.now() - startedAt,
      });

      toolsUsed.push({
        toolId: invocation.toolId,
        name: invocation.name,
        risk: invocation.risk,
        status: invocation.status,
        summary: invocation.summary,
      });

      const collected = invocation.output?.evidence;
      if (Array.isArray(collected)) evidence.push(...(collected as Evidence[]));

      if (invocation.status === 'AWAITING_APPROVAL') {
        status = 'AWAITING_APPROVAL';
        approvalId = invocation.approvalId;
        break;
      }

      if (invocation.status === 'BLOCKED' && step.required !== false) {
        status = 'BLOCKED';
        break;
      }

      if (invocation.status === 'FAILED' && step.required !== false) {
        status = 'FAILED';
        break;
      }
    }

    return {
      taskId: task.taskId,
      agentId: this.id,
      status,
      summary: this.summarize({ task, invocations, evidence }),
      toolsUsed,
      trace,
      evidence,
      ...(approvalId === undefined ? {} : { approvalId }),
    };
  }

  /**
   * Self-check before the result is shown.
   *
   * Catches the failures an agent can detect about its own output: using a tool
   * it never declared, claiming success with nothing to show, or asserting
   * something with no evidence behind it.
   */
  async verify(execution: AgentExecution): Promise<AgentVerification> {
    const issues: string[] = [];

    const undeclared = execution.toolsUsed
      .map((tool) => tool.toolId)
      .filter((toolId) => !this.requiredTools.includes(toolId));
    if (undeclared.length > 0) {
      issues.push(`Memakai tool di luar deklarasi agen: ${undeclared.join(', ')}.`);
    }

    if (execution.summary.trim().length === 0) {
      issues.push('Tidak ada ringkasan hasil yang dapat ditampilkan.');
    }

    if (execution.status === 'SUCCEEDED' && execution.toolsUsed.length === 0) {
      issues.push('Berstatus selesai tetapi tidak ada tool yang dijalankan.');
    }

    if (
      execution.status === 'SUCCEEDED' &&
      this.requiredTools.includes('knowledge.search') &&
      execution.evidence.length === 0
    ) {
      issues.push('Tidak ada sumber yang dikutip untuk jawaban berbasis pengetahuan.');
    }

    return { ok: issues.length === 0, issues, checkedAt: new Date().toISOString() };
  }
}

/** Shared helper: a short, honest account of which steps produced something. */
export function describeInvocations(invocations: ToolInvocation[]): string {
  const succeeded = invocations.filter((invocation) => invocation.status === 'SUCCEEDED');
  const blocked = invocations.filter((invocation) => invocation.status === 'BLOCKED');
  const waiting = invocations.filter((invocation) => invocation.status === 'AWAITING_APPROVAL');

  const parts: string[] = [];
  if (succeeded.length > 0) {
    parts.push(`${succeeded.length} langkah selesai (${succeeded.map((item) => item.name).join(', ')})`);
  }
  if (waiting.length > 0) {
    parts.push(`${waiting.length} langkah menunggu persetujuan`);
  }
  if (blocked.length > 0) {
    parts.push(`${blocked.length} langkah diblokir kebijakan`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Tidak ada langkah yang dijalankan.';
}
