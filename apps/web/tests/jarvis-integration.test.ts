import { describe, expect, it } from 'vitest';
import type { JarvisCapability, JarvisCommand, JarvisResult } from '@tania/types';
import type { JarvisCapabilityAdapter } from '@tania/core/runtime';
import { CapabilityRoutingAdapter } from '@/lib/tania/runtime/adapter';
import { AdapterBackedJarvisRuntime } from '@/lib/tania/runtime/jarvis';
import { createMockCapabilityAdapters } from '@/lib/tania/runtime/capabilities/mock';
import { failed, succeeded } from '@/lib/tania/runtime/commands';
import { TaniaBrain } from '@/lib/tania/brain';
import { MockLlmProvider } from '@/lib/tania/llm/mock-provider';
import { MockKnowledgeRetriever } from '@/lib/tania/rag/mock-retriever';
import { InMemoryApprovalStore } from '@/lib/tania/approvals/store';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import { InMemoryAgentRegistry } from '@/lib/agents/registry';
import { KeywordAgentRouter } from '@/lib/agents/router';
import { IntentService, KeywordIntentClassifier } from '@/lib/tania/services/intent-service';
import { CapabilityPlanner } from '@/lib/orchestration/planner';
import { GovernedToolRouter } from '@/lib/orchestration/tool-router';
import { RetryingExecutionManager } from '@/lib/orchestration/execution-manager';
import { PlanVerificationManager } from '@/lib/orchestration/verification-manager';
import { StoreApprovalManager } from '@/lib/orchestration/approval-manager';
import { InMemoryTaskStore } from '@/lib/orchestration/task-store';
import { InMemoryMemoryStore } from '@/lib/orchestration/memory-store';
import { TaskOrchestrator } from '@/lib/orchestration/orchestrator';
import { ScriptedAgent, fakeRetriever } from './helpers/task-harness';

/**
 * A mock JARVIS that records every command it was sent.
 *
 * The point of these tests is the boundary itself: what TANIA *asks* JARVIS to
 * do, and what it does with the answer. So the assertions are about commands
 * and results, not about simulated side effects.
 */
class RecordingToolsAdapter implements JarvisCapabilityAdapter {
  readonly id = 'recording.tools';
  readonly capability: JarvisCapability = 'tools';
  readonly live = false;

  readonly received: JarvisCommand[] = [];

  constructor(
    private readonly respond: (command: JarvisCommand) => JarvisResult = (command) =>
      succeeded(command, {
        summary: `${String(command.parameters.toolName)} dijalankan.`,
        output: { ran: true },
      }),
  ) {}

  async handle(command: JarvisCommand): Promise<JarvisResult> {
    this.received.push(command);
    return this.respond(command);
  }
}

function runtimeWith(tools: RecordingToolsAdapter): AdapterBackedJarvisRuntime {
  const others = createMockCapabilityAdapters().filter((a) => a.capability !== 'tools');
  return new AdapterBackedJarvisRuntime(
    new CapabilityRoutingAdapter({
      id: 'mock-jarvis',
      adapters: [tools, ...others],
      maxAttempts: 1,
      sleep: async () => {},
    }),
  );
}

interface StackOptions {
  tools?: string[];
  risk?: 'LOW' | 'HIGH';
  respond?: (command: JarvisCommand) => JarvisResult;
}

/** Intent → Plan → JarvisRuntimeAdapter → JARVIS → Result → Verification. */
function stack(options: StackOptions = {}) {
  const agent = new ScriptedAgent(
    'agent.test',
    'Test Agent',
    options.tools ?? ['analytics.query'],
    options.risk ?? 'HIGH',
  );
  const registry = new InMemoryAgentRegistry([agent]);
  const jarvis = new RecordingToolsAdapter(options.respond);
  const runtime = runtimeWith(jarvis);
  const approvals = new InMemoryApprovalStore();
  const tasks = new InMemoryTaskStore();

  const orchestrator = new TaskOrchestrator({
    intents: new IntentService(new KeywordIntentClassifier()),
    router: new KeywordAgentRouter(registry, { fallbackAgentId: agent.id }),
    registry,
    planner: new CapabilityPlanner({ approvalThreshold: 'HIGH' }),
    execution: new RetryingExecutionManager(
      new GovernedToolRouter({
        approvals,
        runtime,
        retriever: fakeRetriever(),
        approvalThreshold: 'HIGH',
        topK: 3,
      }),
      { maxAttempts: 2, sleep: async () => {} },
    ),
    verification: new PlanVerificationManager(),
    approvals: new StoreApprovalManager(approvals),
    tasks,
    memory: new InMemoryMemoryStore(),
  });

  return { orchestrator, jarvis, approvals, runtime, actor: DEMO_ACTOR };
}

describe('TANIA to JARVIS, end to end', () => {
  it('turns a planned action into a structured command', async () => {
    const { orchestrator, jarvis, actor } = stack();

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.status).toBe('COMPLETED');
    expect(jarvis.received).toHaveLength(1);

    const command = jarvis.received[0] as JarvisCommand;
    expect(command.capability).toBe('tools');
    expect(command.action).toBe('tools.invoke');
    expect(command.parameters.toolId).toBe('analytics.query');
    expect(command.risk).toBe('LOW');
    expect(command.requiresApproval).toBe(false);
    expect(command.correlationId).toBe('req-1');
    expect(command.actorId).toBe(actor.id);
    expect(command.sessionId).toBe('conv-1');
    expect(command.requestId).toBeTruthy();
  });

  it('carries the runtime result into the task trace and verification', async () => {
    const { orchestrator, actor } = stack();

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.tools[0]?.status).toBe('SUCCEEDED');
    expect(report.tools[0]?.summary).toContain('Analytics Query dijalankan');
    expect(report.verification.ok).toBe(true);
    expect(report.result).toContain('Tugas selesai');
  });

  it('lifts runtime evidence and artifacts into the report', async () => {
    const { orchestrator, actor } = stack({
      respond: (command) =>
        succeeded(command, {
          summary: 'Laporan dihasilkan.',
          artifacts: [
            {
              id: 'artifact-1',
              kind: 'file',
              name: 'laporan.csv',
              mediaType: 'text/csv',
              // A runtime that stores a file reports where it put it; without
              // that the artifact is something nobody can open.
              uri: 'jarvis://artifacts/laporan.csv',
              sizeBytes: 42,
            },
          ],
          evidence: [
            {
              id: 'runtime-doc-1',
              title: 'Delivery Metrics Export',
              source: 'JARVIS Analytics',
              snippet: '12 program on track.',
              classification: 'INTERNAL',
              updatedAt: '2026-09-18',
              score: 0.8,
            },
          ],
        }),
    });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.evidence.map((item) => item.id)).toContain('runtime-doc-1');
    expect(report.artifacts.map((item) => item.title)).toContain('laporan.csv');
    expect(report.artifacts[0]?.producedBy).toBe('analytics.query');
    expect(report.artifacts[0]?.verified).toBe(true);
    expect(report.status).toBe('COMPLETED');
  });

  it('reports a runtime failure as a failed task rather than a silent success', async () => {
    const { orchestrator, actor } = stack({
      respond: (command) =>
        failed(command, {
          code: 'RUNTIME_UNREACHABLE',
          message: 'Runtime tidak dapat dihubungi.',
          retryable: true,
        }),
    });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.status).toBe('FAILED');
    expect(report.errors.map((error) => error.code)).toContain('TOOL_FAILED');
    expect(report.plan[0]?.detail).toContain('tidak dapat dihubungi');
  });

  it('sends nothing to the runtime until a human approved the L3 action', async () => {
    const { orchestrator, jarvis, approvals, actor } = stack({ tools: ['workflow.execute'] });

    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(parked.status).toBe('APPROVAL');
    expect(jarvis.received).toHaveLength(0);

    await approvals.decide(parked.pendingApprovalId as string, 'APPROVED', actor);
    const resumed = await orchestrator.resume(parked.taskId, actor, 'req-2');

    expect(resumed.status).toBe('COMPLETED');
    expect(jarvis.received).toHaveLength(1);

    const command = jarvis.received[0] as JarvisCommand;
    expect(command.risk).toBe('HIGH');
    expect(command.requiresApproval).toBe(true);
    // The decision travels with the command, so the runtime can check it too.
    expect(command.approvalId).toBe(parked.pendingApprovalId);
  });

  it('refuses an L3 command whose approval is missing, even if a caller asks', async () => {
    const jarvis = new RecordingToolsAdapter();
    const runtime = runtimeWith(jarvis);
    const { findTool } = await import('@/lib/tania/tools/registry');

    const result = await runtime.execute({
      tool: findTool('workflow.execute')!,
      input: {},
      actor: DEMO_ACTOR,
      correlationId: 'req-1',
      // No approvalId: the governance layer is being bypassed.
      requiresApproval: true,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('APPROVAL_REQUIRED');
    expect(jarvis.received).toHaveLength(0);
  });
});

describe('the Brain over a mock JARVIS', () => {
  it('answers from evidence without touching the runtime', async () => {
    const jarvis = new RecordingToolsAdapter();
    const brain = new TaniaBrain({
      llm: new MockLlmProvider(),
      retriever: new MockKnowledgeRetriever(),
      runtime: runtimeWith(jarvis),
      approvals: new InMemoryApprovalStore(),
      topK: 3,
      approvalThreshold: 'HIGH',
    });

    const response = await brain.ask(
      { sessionId: 's1', message: 'Cari kebijakan tata kelola AI' },
      DEMO_ACTOR,
    );

    expect(response.evidence.length).toBeGreaterThan(0);
    // Retrieval is served by the knowledge layer; JARVIS is not involved.
    expect(jarvis.received).toHaveLength(0);
  });

  it('executes through the runtime only after the gate is decided', async () => {
    const approvals = new InMemoryApprovalStore();
    const jarvis = new RecordingToolsAdapter();
    const brain = new TaniaBrain({
      llm: new MockLlmProvider(),
      retriever: new MockKnowledgeRetriever(),
      runtime: runtimeWith(jarvis),
      approvals,
      topK: 3,
      approvalThreshold: 'HIGH',
    });

    const gated = await brain.ask(
      { sessionId: 's2', message: 'Jalankan workflow laporan status mingguan' },
      DEMO_ACTOR,
    );

    expect(gated.approval?.status).toBe('PENDING');
    expect(jarvis.received).toHaveLength(0);

    await brain.resolveApproval(gated.approval!.id, 'APPROVED', DEMO_ACTOR);

    expect(jarvis.received).toHaveLength(1);
    expect(jarvis.received[0]?.requiresApproval).toBe(true);
    expect(jarvis.received[0]?.approvalId).toBe(gated.approval!.id);
  });
});
