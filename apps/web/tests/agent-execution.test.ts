import { describe, expect, it, vi } from 'vitest';
import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { Evidence, RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '@/lib/agents/base/base-agent';
import { GovernedToolInvoker } from '@/lib/agents/base/governed-tool-invoker';
import { KnowledgeAgent } from '@/lib/agents/knowledge/knowledge-agent';
import { PerformanceAgent } from '@/lib/agents/performance/performance-agent';
import { InMemoryApprovalStore } from '@/lib/tania/approvals/store';
import { MockJarvisRuntime } from '@/lib/tania/runtime/jarvis';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { Actor } from '@/lib/identity/types';
import type { KnowledgeRetriever } from '@/lib/tania/rag';

const EVIDENCE: Evidence[] = [
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

function fakeRetriever(evidence: Evidence[] = EVIDENCE): KnowledgeRetriever {
  return { id: 'fake', search: async () => evidence };
}

function task(question = 'Analisa performance product X.'): AgentTask {
  return {
    taskId: 'task-1',
    agentId: 'agent.performance',
    question,
    intent: 'ANALYZE',
    context: {
      correlationId: 'req-1',
      sessionId: 'conv-1',
      actor: DEMO_ACTOR,
      channel: 'portal',
      startedAt: new Date().toISOString(),
    },
  };
}

function makeInvoker(
  agent: { id: string; name: string; requiredTools: string[]; riskLevel: RiskLevel },
  overrides: { actor?: Actor; retriever?: KnowledgeRetriever } = {},
) {
  const approvals = new InMemoryApprovalStore();
  const runtime = new MockJarvisRuntime();

  const invoker = new GovernedToolInvoker({
    agent: agent as never,
    actor: overrides.actor ?? DEMO_ACTOR,
    sessionId: 'conv-1',
    correlationId: 'req-1',
    approvals,
    runtime,
    retriever: overrides.retriever ?? fakeRetriever(),
    approvalThreshold: 'HIGH',
    topK: 3,
    question: 'Analisa performance product X.',
  });

  return { invoker, approvals, runtime };
}

/** Declares a HIGH-risk tool, so the approval gate can be exercised. */
class AutomationTestAgent extends BaseAgent {
  readonly id = 'agent.test-automation';
  readonly name = 'Automation Test Agent';
  readonly domain = 'Test';
  readonly description = 'Agen uji yang menjalankan workflow berisiko tinggi.';
  readonly capabilities: AgentCapability[] = [
    {
      id: 'automation.run',
      label: 'Menjalankan workflow',
      intents: ['AUTOMATE'],
      keywords: ['workflow'],
      stage: 'ACT',
    },
  ];
  readonly requiredTools = ['workflow.execute', 'knowledge.search'];
  readonly riskLevel: RiskLevel = 'HIGH';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Test';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'workflow.execute',
        label: 'Menjalankan workflow',
        stage: 'ACT',
        input: () => ({}),
      },
      {
        toolId: 'knowledge.search',
        label: 'Langkah sesudah gate',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    return `Menjalankan ${input.invocations.length} langkah.`;
  }
}

describe('agent execution through controlled tools', () => {
  it('runs every declared step and collects the evidence it retrieved', async () => {
    const agent = new PerformanceAgent();
    const { invoker } = makeInvoker(agent);

    const execution = await agent.execute(task(), invoker);

    expect(execution.status).toBe('SUCCEEDED');
    expect(execution.toolsUsed.map((tool) => tool.toolId)).toEqual([
      'enterprise.data',
      'knowledge.search',
      'analytics.query',
    ]);
    expect(execution.trace).toHaveLength(3);
    expect(execution.evidence).toHaveLength(1);
    expect(execution.summary).toContain('kutipan konteks');
  });

  it('refuses a tool the agent never declared', async () => {
    const agent = new KnowledgeAgent();
    const { invoker, runtime } = makeInvoker(agent);
    const runtimeSpy = vi.spyOn(runtime, 'execute');

    const invocation = await invoker.invoke('system.broadcast', {});

    expect(invocation.status).toBe('BLOCKED');
    expect(invocation.summary).toContain('tidak terdaftar pada agen');
    expect(runtimeSpy).not.toHaveBeenCalled();
  });

  it('refuses a tool that is not in the global registry', async () => {
    const { invoker } = makeInvoker({
      id: 'agent.rogue',
      name: 'Rogue',
      requiredTools: ['shell.exec'],
      riskLevel: 'CRITICAL',
    });

    const invocation = await invoker.invoke('shell.exec', {});

    expect(invocation.status).toBe('BLOCKED');
    expect(invocation.summary).toContain('tidak terdaftar di tool registry');
  });

  it('refuses a declared tool when the actor lacks its scope', async () => {
    const agent = new PerformanceAgent();
    const limited: Actor = { ...DEMO_ACTOR, scopes: ['knowledge:read'] };
    const { invoker, runtime } = makeInvoker(agent, { actor: limited });
    const runtimeSpy = vi.spyOn(runtime, 'execute');

    const execution = await agent.execute(task(), invoker);

    expect(execution.status).toBe('BLOCKED');
    expect(execution.toolsUsed[0]?.status).toBe('BLOCKED');
    expect(execution.toolsUsed[0]?.summary).toContain('analytics:read');
    expect(runtimeSpy).not.toHaveBeenCalled();
  });

  it('stops at a human approval gate instead of executing', async () => {
    const agent = new AutomationTestAgent();
    const { invoker, approvals, runtime } = makeInvoker(agent);
    const runtimeSpy = vi.spyOn(runtime, 'execute');

    const execution = await agent.execute({ ...task(), agentId: agent.id }, invoker);

    expect(execution.status).toBe('AWAITING_APPROVAL');
    expect(execution.approvalId).toBeTruthy();
    expect(runtimeSpy).not.toHaveBeenCalled();
    // The gate stops the run: the step after it never happened.
    expect(execution.trace).toHaveLength(1);

    const pending = await approvals.list(DEMO_ACTOR);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe('PENDING');
    expect(pending[0]?.toolId).toBe('workflow.execute');
  });

  it('reports only the tools the agent may currently use', () => {
    const agent = new PerformanceAgent();
    const limited: Actor = { ...DEMO_ACTOR, scopes: ['knowledge:read'] };
    const { invoker } = makeInvoker(agent, { actor: limited });

    expect(invoker.available()).toEqual(['knowledge.search']);
  });

  it('continues past an optional step that was blocked', async () => {
    const agent = new ProductAgentUnderTest();
    const limited: Actor = { ...DEMO_ACTOR, scopes: ['knowledge:read'] };
    const { invoker } = makeInvoker(agent, { actor: limited });

    const execution = await agent.execute({ ...task(), agentId: agent.id }, invoker);

    // analytics.query is optional for this agent, so the run still completes.
    expect(execution.status).toBe('SUCCEEDED');
    expect(execution.toolsUsed.map((tool) => tool.status)).toEqual(['SUCCEEDED', 'BLOCKED']);
  });
});

/** Product agent has an optional analytics step; used to test soft failures. */
class ProductAgentUnderTest extends BaseAgent {
  readonly id = 'agent.test-product';
  readonly name = 'Product Test Agent';
  readonly domain = 'Test';
  readonly description = 'Agen uji dengan satu langkah opsional.';
  readonly capabilities: AgentCapability[] = [
    {
      id: 'product.health',
      label: 'Kesehatan produk',
      intents: ['ANALYZE'],
      keywords: ['produk'],
      stage: 'REASON',
    },
  ];
  readonly requiredTools = ['knowledge.search', 'analytics.query'];
  readonly riskLevel: RiskLevel = 'LOW';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Test';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      { toolId: 'knowledge.search', label: 'Cari', stage: 'KNOW', input: (item) => ({ query: item.question }) },
      { toolId: 'analytics.query', label: 'Metrik', stage: 'REASON', required: false, input: () => ({}) },
    ];
  }

  protected summarize(): string {
    return 'Selesai dengan langkah opsional yang dilewati.';
  }
}

describe('agent self-verification', () => {
  it('passes when the run used declared tools and produced evidence', async () => {
    const agent = new KnowledgeAgent();
    const { invoker } = makeInvoker(agent);

    const execution = await agent.execute({ ...task(), agentId: agent.id }, invoker);
    const verification = await agent.verify(execution);

    expect(verification.ok).toBe(true);
    expect(verification.issues).toEqual([]);
  });

  it('flags a knowledge answer that cites nothing', async () => {
    const agent = new KnowledgeAgent();
    const { invoker } = makeInvoker(agent, { retriever: fakeRetriever([]) });

    const execution = await agent.execute({ ...task(), agentId: agent.id }, invoker);
    const verification = await agent.verify(execution);

    expect(verification.ok).toBe(false);
    expect(verification.issues.join(' ')).toContain('Tidak ada sumber yang dikutip');
  });

  it('flags a run that used a tool outside the agent declaration', async () => {
    const agent = new KnowledgeAgent();
    const verification = await agent.verify({
      taskId: 'task-1',
      agentId: agent.id,
      status: 'SUCCEEDED',
      summary: 'ok',
      evidence: EVIDENCE,
      trace: [],
      toolsUsed: [
        {
          toolId: 'system.broadcast',
          name: 'Enterprise Broadcast',
          risk: 'CRITICAL',
          status: 'SUCCEEDED',
          summary: 'terkirim',
        },
      ],
    });

    expect(verification.ok).toBe(false);
    expect(verification.issues.join(' ')).toContain('di luar deklarasi agen');
  });

  it('flags success with no work done', async () => {
    const agent = new KnowledgeAgent();
    const verification = await agent.verify({
      taskId: 'task-1',
      agentId: agent.id,
      status: 'SUCCEEDED',
      summary: 'ok',
      evidence: [],
      trace: [],
      toolsUsed: [],
    });

    expect(verification.ok).toBe(false);
    expect(verification.issues.length).toBeGreaterThanOrEqual(1);
  });
});
