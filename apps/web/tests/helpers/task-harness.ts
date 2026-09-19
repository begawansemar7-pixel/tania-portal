/**
 * Shared fixtures for the orchestrator tests.
 *
 * The agents, runtime and retriever here are deliberately small and scripted:
 * a lifecycle test should fail because the lifecycle is wrong, never because a
 * real agent changed its wording.
 */
import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { Evidence, RiskLevel, TaskReport, TaskState } from '@tania/types';
import { TASK_STATES } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '@/lib/agents/base/base-agent';
import { InMemoryAgentRegistry } from '@/lib/agents/registry';
import { KeywordAgentRouter } from '@/lib/agents/router';
import { InMemoryApprovalStore } from '@/lib/tania/approvals/store';
import type { JarvisCapability, JarvisCommand, JarvisResult } from '@tania/types';
import type { JarvisCapabilityAdapter } from '@tania/core/runtime';
import { AdapterBackedJarvisRuntime } from '@/lib/tania/runtime/jarvis';
import { CapabilityRoutingAdapter } from '@/lib/tania/runtime/adapter';
import { createMockCapabilityAdapters } from '@/lib/tania/runtime/capabilities/mock';
import { failed, succeeded } from '@/lib/tania/runtime/commands';
import type { KnowledgeRetriever } from '@/lib/tania/rag';
import { IntentService, KeywordIntentClassifier } from '@/lib/tania/services/intent-service';
import { CapabilityPlanner } from '@/lib/orchestration/planner';
import { GovernedToolRouter } from '@/lib/orchestration/tool-router';
import { RetryingExecutionManager } from '@/lib/orchestration/execution-manager';
import { PlanVerificationManager } from '@/lib/orchestration/verification-manager';
import { StoreApprovalManager } from '@/lib/orchestration/approval-manager';
import { InMemoryTaskStore } from '@/lib/orchestration/task-store';
import { InMemoryMemoryStore } from '@/lib/orchestration/memory-store';
import { TaskOrchestrator } from '@/lib/orchestration/orchestrator';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { Actor } from '@/lib/identity/types';

export const EVIDENCE: Evidence[] = [
  {
    id: 'doc.report-delivery-q3#s1:0',
    title: 'Delivery Health Report — Q3 2026',
    source: 'Delivery Management Office',
    snippet: '12 on track, 4 perlu perhatian, 2 at risk.',
    classification: 'CONFIDENTIAL',
    updatedAt: '2026-09-12',
    score: 0.9,
  },
];

export function fakeRetriever(evidence: Evidence[] = EVIDENCE): KnowledgeRetriever {
  return { id: 'fake', search: async () => evidence };
}

/**
 * A `tools` capability whose outcome is decided by the test, not by chance.
 *
 * Replacing only this adapter keeps the rest of the path real: commands still
 * travel through `CapabilityRoutingAdapter`, so timeout, retry and cancellation
 * behave in tests exactly as they do in the portal.
 */
export class ScriptedToolsAdapter implements JarvisCapabilityAdapter {
  readonly id = 'scripted.tools';
  readonly capability: JarvisCapability = 'tools';
  readonly live = false;

  readonly calls: string[] = [];
  readonly compensated: string[] = [];

  /** Per tool: the outcome of each successive call. Missing → always succeed. */
  constructor(private readonly script: Record<string, Array<'SUCCEEDED' | 'FAILED'>> = {}) {}

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    const toolId = String(command.parameters.toolId ?? '');
    const name = String(command.parameters.toolName ?? toolId);

    if (command.action === 'tools.compensate') {
      this.compensated.push(toolId);
      return succeeded(command, { summary: `${name} dibatalkan.` });
    }

    this.calls.push(toolId);
    const queue = this.script[toolId];
    const outcome = queue && queue.length > 0 ? (queue.shift() as 'SUCCEEDED' | 'FAILED') : 'SUCCEEDED';

    if (outcome === 'FAILED') {
      return failed(command, {
        code: 'SCRIPTED_FAILURE',
        message: `${name} gagal pada runtime uji.`,
        retryable: true,
      });
    }

    // Mirrors the real runtime: drafting produces something to verify.
    const artifacts =
      toolId === 'document.draft'
        ? [
            {
              id: `${command.requestId}:draft`,
              kind: 'text' as const,
              name: 'draft.md',
              mediaType: 'text/markdown',
              text: `# Draf untuk ${command.task}`,
            },
          ]
        : undefined;

    return succeeded(command, {
      summary: `${name} dijalankan pada runtime uji.`,
      output: { simulated: true, toolId },
      ...(artifacts === undefined ? {} : { artifacts }),
    });
  }
}

/** The scripted tools adapter wired into an otherwise ordinary runtime. */
export class ScriptedRuntime extends AdapterBackedJarvisRuntime {
  readonly tools: ScriptedToolsAdapter;

  constructor(script: Record<string, Array<'SUCCEEDED' | 'FAILED'>> = {}) {
    const tools = new ScriptedToolsAdapter(script);
    const others = createMockCapabilityAdapters().filter(
      (adapter) => adapter.capability !== 'tools',
    );

    super(
      new CapabilityRoutingAdapter({
        id: 'scripted',
        adapters: [tools, ...others],
        // The execution manager owns retry for the plan; the runtime must not
        // quietly retry underneath it or the attempt counts would lie.
        maxAttempts: 1,
        sleep: async () => {},
      }),
    );

    this.tools = tools;
  }

  get calls(): string[] {
    return this.tools.calls;
  }

  get compensated(): string[] {
    return this.tools.compensated;
  }
}

/** Minimal agent whose tool list the test chooses. */
export class ScriptedAgent extends BaseAgent {
  readonly domain = 'Test';
  readonly description = 'Agen uji untuk siklus hidup orkestrator.';
  readonly capabilities: AgentCapability[] = [
    {
      id: 'test.capability',
      label: 'Kapabilitas uji',
      intents: ['ANALYZE'],
      keywords: ['performance', 'uji'],
      stage: 'REASON',
    },
  ];
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Test';

  constructor(
    readonly id: string,
    readonly name: string,
    readonly requiredTools: string[],
    readonly riskLevel: RiskLevel,
  ) {
    super();
  }

  protected steps(task: AgentTask): ToolStep[] {
    return this.requiredTools.map((toolId) => ({
      toolId,
      label: `Langkah ${toolId}`,
      stage: 'ACT' as const,
      input: () => ({ question: task.question }),
    }));
  }

  protected summarize(input: AgentSummaryInput): string {
    return `${input.invocations.length} langkah dijalankan.`;
  }
}

export interface HarnessOptions {
  tools?: string[];
  riskLevel?: RiskLevel;
  script?: Record<string, Array<'SUCCEEDED' | 'FAILED'>>;
  evidence?: Evidence[];
  actor?: Actor;
  maxAttempts?: number;
}

export interface Harness {
  orchestrator: TaskOrchestrator;
  approvals: InMemoryApprovalStore;
  runtime: ScriptedRuntime;
  tasks: InMemoryTaskStore;
  memory: InMemoryMemoryStore;
  agent: ScriptedAgent;
  actor: Actor;
}

/**
 * Builds an orchestrator wired exactly like production, with three things
 * pinned: the runtime script, the evidence, and instant retry backoff.
 */
export function harness(options: HarnessOptions = {}): Harness {
  const agent = new ScriptedAgent(
    'agent.test',
    'Test Agent',
    options.tools ?? ['knowledge.search'],
    options.riskLevel ?? 'HIGH',
  );

  const registry = new InMemoryAgentRegistry([agent]);
  const router = new KeywordAgentRouter(registry, { fallbackAgentId: agent.id });
  const approvals = new InMemoryApprovalStore();
  const runtime = new ScriptedRuntime(options.script ?? {});
  const tasks = new InMemoryTaskStore();
  const memory = new InMemoryMemoryStore();

  const toolRouter = new GovernedToolRouter({
    approvals,
    runtime,
    retriever: fakeRetriever(options.evidence ?? EVIDENCE),
    approvalThreshold: 'HIGH',
    topK: 3,
  });

  const orchestrator = new TaskOrchestrator({
    intents: new IntentService(new KeywordIntentClassifier()),
    router,
    registry,
    planner: new CapabilityPlanner({ approvalThreshold: 'HIGH' }),
    execution: new RetryingExecutionManager(toolRouter, {
      maxAttempts: options.maxAttempts ?? 2,
      sleep: async () => {},
    }),
    verification: new PlanVerificationManager(),
    approvals: new StoreApprovalManager(approvals),
    tasks,
    memory,
  });

  return {
    orchestrator,
    approvals,
    runtime,
    tasks,
    memory,
    agent,
    actor: options.actor ?? DEMO_ACTOR,
  };
}

const STATE_SET = new Set<string>(TASK_STATES);

/**
 * The states a task actually passed through.
 *
 * Read back from the trace, because the trace is what a caller sees: if the
 * ordering is wrong there, it is wrong where it matters.
 */
export function statesVisited(report: TaskReport): TaskState[] {
  const prefix = `${report.taskId}-`;

  return report.trace
    .filter((step) => step.id.startsWith(prefix))
    .map((step) => step.id.slice(prefix.length).toUpperCase())
    .filter((candidate): candidate is TaskState => STATE_SET.has(candidate));
}
