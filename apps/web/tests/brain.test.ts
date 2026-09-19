import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import { TaniaBrain } from '@/lib/tania/brain';
import { InMemoryApprovalStore } from '@/lib/tania/approvals/store';
import { MockLlmProvider } from '@/lib/tania/llm/mock-provider';
import { MockKnowledgeRetriever } from '@/lib/tania/rag/mock-retriever';
import { MockJarvisRuntime } from '@/lib/tania/runtime/jarvis';

let approvals: InMemoryApprovalStore;
let brain: TaniaBrain;

beforeEach(() => {
  approvals = new InMemoryApprovalStore();
  brain = new TaniaBrain({
    llm: new MockLlmProvider(),
    retriever: new MockKnowledgeRetriever(),
    runtime: new MockJarvisRuntime(),
    approvals,
    topK: 3,
    approvalThreshold: 'HIGH',
  });
});

describe('TANIA Brain', () => {
  it('answers a search with citations and an execution trace', async () => {
    const response = await brain.ask(
      { sessionId: 's1', message: 'Cari kebijakan tata kelola AI' },
      DEMO_ACTOR,
    );

    expect(response.intent).toBe('SEARCH');
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.answer).toContain(response.evidence[0].title);
    expect(response.trace.some((step) => step.stage === 'VERIFY')).toBe(true);
    expect(response.approval).toBeUndefined();
  });

  it('opens an approval gate for high risk automation instead of executing', async () => {
    const response = await brain.ask(
      { sessionId: 's2', message: 'Jalankan workflow laporan status mingguan' },
      DEMO_ACTOR,
    );

    expect(response.intent).toBe('AUTOMATE');
    expect(response.approval?.status).toBe('PENDING');
    expect(response.risk).toBe('HIGH');
    expect(
      response.trace.find((step) => step.toolId === 'workflow.execute')?.status,
    ).toBe('AWAITING_APPROVAL');
    expect(await approvals.list()).toHaveLength(1);
  });

  it('blocks tools the actor has no scope for', async () => {
    const restricted = { ...DEMO_ACTOR, scopes: ['knowledge:read' as const] };
    const response = await brain.ask(
      { sessionId: 's3', message: 'Analisis tren adopsi produk' },
      restricted,
    );

    expect(
      response.toolsUsed.find((tool) => tool.toolId === 'analytics.query')?.status,
    ).toBe('BLOCKED');
  });

  it('executes the gated action only after a human approves it', async () => {
    const response = await brain.ask(
      { sessionId: 's4', message: 'Jalankan workflow rekap adopsi' },
      DEMO_ACTOR,
    );
    const approvalId = response.approval?.id;
    expect(approvalId).toBeDefined();

    const result = await brain.resolveApproval(approvalId!, 'APPROVED', DEMO_ACTOR);
    expect(result.approval.status).toBe('APPROVED');
    expect(result.trace.some((step) => step.stage === 'VERIFY')).toBe(true);
  });

  it('refuses an approval decision from an actor without the approve scope', async () => {
    const response = await brain.ask(
      { sessionId: 's5', message: 'Jalankan workflow rekap adopsi' },
      DEMO_ACTOR,
    );
    const approver = { ...DEMO_ACTOR, scopes: ['workflow:run' as const] };

    await expect(
      brain.resolveApproval(response.approval!.id, 'APPROVED', approver),
    ).rejects.toThrow('not allowed');
  });
});
