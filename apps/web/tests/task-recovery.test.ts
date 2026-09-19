import { describe, expect, it } from 'vitest';
import type { ExecutionOutcome, TaskContext } from '@tania/core/orchestration';
import type { PlannedAction, RiskLevel, TaskReport, ToolUsage } from '@tania/types';
import { RISK_CODE } from '@tania/types';
import { PlanVerificationManager } from '@/lib/orchestration/verification-manager';
import { ScriptedAgent, harness, statesVisited } from './helpers/task-harness';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';

const QUESTION = 'Analisa performance product X.';

describe('transient failure', () => {
  it('retries a step that failed once and still completes', async () => {
    const { orchestrator, actor, runtime } = harness({
      tools: ['analytics.query'],
      script: { 'analytics.query': ['FAILED'] },
    });

    const report = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    expect(report.status).toBe('COMPLETED');
    expect(report.plan[0]?.status).toBe('SUCCEEDED');
    expect(report.plan[0]?.attempts).toBe(2);
    expect(runtime.calls).toEqual(['analytics.query', 'analytics.query']);
    expect(report.errors).toEqual([]);
  });

  it('records the retry in the trace without hiding it', async () => {
    const { orchestrator, actor } = harness({
      tools: ['analytics.query'],
      script: { 'analytics.query': ['FAILED'] },
    });

    const report = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');
    const details = report.trace.map((step) => step.detail ?? '').join(' ');

    expect(details).toContain('mencoba ulang (1/2)');
  });
});

describe('permanent failure', () => {
  it('stops after the attempts are spent and reports FAILED', async () => {
    const { orchestrator, actor, runtime } = harness({
      tools: ['analytics.query'],
      script: { 'analytics.query': ['FAILED', 'FAILED'] },
    });

    const report = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    expect(report.status).toBe('FAILED');
    expect(runtime.calls).toHaveLength(2);
    expect(report.errors.map((error) => error.code)).toContain('TOOL_FAILED');
    expect(report.errors[0]?.recoverable).toBe(true);
    expect(report.result).toContain('gagal');
    // A failure is still reported and still remembered.
    expect(statesVisited(report)).toEqual([
      'UNDERSTANDING',
      'PLANNING',
      'EXECUTING',
      'VERIFYING',
      'REPORTING',
      'REMEMBERING',
      'FAILED',
    ]);
  });

  it('undoes the reversible work that already happened', async () => {
    const { orchestrator, actor, runtime } = harness({
      tools: ['document.draft', 'analytics.query'],
      script: { 'analytics.query': ['FAILED', 'FAILED'] },
    });

    const report = await orchestrator.start(
      { question: 'Buat draft dan cek metrik.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.status).toBe('FAILED');
    expect(report.plan[0]?.status).toBe('COMPENSATED');
    expect(runtime.compensated).toEqual(['document.draft']);
    expect(report.result).toContain('dibatalkan kembali');
  });

  it('leaves an irreversible step alone rather than pretending to undo it', async () => {
    const { orchestrator, actor, runtime } = harness({
      tools: ['enterprise.data', 'analytics.query'],
      script: { 'analytics.query': ['FAILED', 'FAILED'] },
    });

    const report = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    expect(report.plan[0]?.status).toBe('SUCCEEDED');
    expect(runtime.compensated).toEqual([]);
  });

  it('does not run later steps once a required step is spent', async () => {
    const { orchestrator, actor, runtime } = harness({
      tools: ['analytics.query', 'enterprise.data'],
      script: { 'analytics.query': ['FAILED', 'FAILED'] },
    });

    await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    expect(runtime.calls).not.toContain('enterprise.data');
  });
});

describe('policy block', () => {
  it('ends BLOCKED when the actor may use none of the planned tools', async () => {
    const limited = { ...DEMO_ACTOR, scopes: ['knowledge:read'] };
    const { orchestrator, runtime } = harness({ tools: ['analytics.query'], actor: limited });

    const report = await orchestrator.start(
      { question: QUESTION, sessionId: 'conv-1' },
      limited,
      'req-1',
    );

    expect(report.status).toBe('BLOCKED');
    expect(report.plan[0]?.status).toBe('BLOCKED');
    expect(report.plan[0]?.detail).toContain('analytics:read');
    expect(runtime.calls).toEqual([]);
    expect(report.result).toContain('kebijakan');
  });

  it('still runs the steps the actor is allowed to take', async () => {
    const limited = { ...DEMO_ACTOR, scopes: ['knowledge:read'] };
    const { orchestrator } = harness({
      tools: ['knowledge.search', 'analytics.query'],
      actor: limited,
    });

    const report = await orchestrator.start(
      { question: QUESTION, sessionId: 'conv-1' },
      limited,
      'req-1',
    );

    expect(report.plan.map((action) => action.status)).toEqual(['SUCCEEDED', 'BLOCKED']);
    expect(report.status).toBe('COMPLETED');
  });
});

describe('human approval gate', () => {
  it('parks an L3 plan before anything runs', async () => {
    const { orchestrator, actor, runtime, approvals } = harness({ tools: ['workflow.execute'] });

    const report = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.status).toBe('APPROVAL');
    expect(report.riskCode).toBe('L3');
    expect(report.pendingApprovalId).toBeTruthy();
    expect(report.plan[0]?.status).toBe('AWAITING_APPROVAL');
    expect(runtime.calls).toEqual([]);
    expect(statesVisited(report)).toEqual(['UNDERSTANDING', 'PLANNING', 'APPROVAL']);

    const pending = await approvals.list(actor);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe('PENDING');
    expect(pending[0]?.toolId).toBe('workflow.execute');
  });

  it('stays parked while the decision is still pending', async () => {
    const { orchestrator, actor, runtime } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const again = await orchestrator.resume(parked.taskId, actor, 'req-2');

    expect(again.status).toBe('APPROVAL');
    expect(runtime.calls).toEqual([]);
  });

  it('runs the action once a human approved it, without opening a second gate', async () => {
    const { orchestrator, actor, runtime, approvals } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    await approvals.decide(parked.pendingApprovalId as string, 'APPROVED', actor);
    const resumed = await orchestrator.resume(parked.taskId, actor, 'req-2');

    expect(resumed.status).toBe('COMPLETED');
    expect(resumed.pendingApprovalId).toBeUndefined();
    expect(resumed.plan[0]?.status).toBe('SUCCEEDED');
    expect(resumed.plan[0]?.approvalId).toBe(parked.pendingApprovalId);
    expect(runtime.calls).toEqual(['workflow.execute']);
    // The approval already given is honoured; no new request is created.
    expect(await approvals.list(actor)).toHaveLength(1);
  });

  it('blocks the task when the decision was a rejection', async () => {
    const { orchestrator, actor, runtime, approvals } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    await approvals.decide(parked.pendingApprovalId as string, 'REJECTED', actor);
    const resumed = await orchestrator.resume(parked.taskId, actor, 'req-2');

    expect(resumed.status).toBe('BLOCKED');
    expect(resumed.plan[0]?.status).toBe('BLOCKED');
    expect(resumed.errors.map((error) => error.code)).toContain('APPROVAL_DENIED');
    expect(runtime.calls).toEqual([]);
    expect(statesVisited(resumed)).toEqual([
      'UNDERSTANDING',
      'PLANNING',
      'APPROVAL',
      'REPORTING',
      'REMEMBERING',
      'BLOCKED',
    ]);
  });

  it('can be traced back to its task, so it is settled in one place only', async () => {
    const { orchestrator, actor, tasks } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const owner = await tasks.findByApproval(parked.pendingApprovalId as string, actor);
    expect(owner?.taskId).toBe(parked.taskId);

    // Not the requester's task, and not an approval anyone owns.
    expect(await tasks.findByApproval(parked.pendingApprovalId as string, { ...actor, id: 'usr_other' })).toBeUndefined();
    expect(await tasks.findByApproval('apr-unknown', actor)).toBeUndefined();
  });

  it('runs the approved action exactly once', async () => {
    const { orchestrator, actor, runtime, approvals } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    await approvals.decide(parked.pendingApprovalId as string, 'APPROVED', actor);
    await orchestrator.resume(parked.taskId, actor, 'req-2');

    expect(runtime.calls.filter((toolId) => toolId === 'workflow.execute')).toHaveLength(1);

    // A second resume must not run it again.
    await expect(orchestrator.resume(parked.taskId, actor, 'req-3')).rejects.toThrow(
      /tidak sedang menunggu persetujuan/,
    );
    expect(runtime.calls.filter((toolId) => toolId === 'workflow.execute')).toHaveLength(1);
  });

  it('refuses to resume a task that is not waiting for anyone', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });
    const done = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    await expect(orchestrator.resume(done.taskId, actor, 'req-2')).rejects.toThrow(
      /tidak sedang menunggu persetujuan/,
    );
  });
});

describe('retrieval that finds nothing', () => {
  it('completes but says plainly that it has no grounds', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'], evidence: [] });

    const report = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    // Finding nothing is an answer, not a defect: failing here would punish
    // TANIA for refusing to invent sources.
    expect(report.status).toBe('COMPLETED');
    expect(report.verification.ok).toBe(true);
    expect(report.evidence).toEqual([]);
    expect(report.result).toContain('Tidak ada sumber yang relevan');
  });
});

describe('governance verification', () => {
  it('flags a tool the agent never declared', async () => {
    const verification = await verify({
      tools: [usage('system.broadcast', 'CRITICAL')],
    });

    expect(verification.ok).toBe(false);
    expect(verification.issues.join(' ')).toContain('di luar deklarasi agen');
  });

  it('flags a high-risk action that ran with no approval recorded', async () => {
    const verification = await verify({
      declared: ['workflow.execute'],
      actions: [action({ toolId: 'workflow.execute', risk: 'HIGH', status: 'SUCCEEDED' })],
      tools: [usage('workflow.execute', 'HIGH')],
    });

    expect(verification.ok).toBe(false);
    expect(verification.issues.join(' ')).toContain('tanpa persetujuan tercatat');
  });

  it('accepts a high-risk action carrying its approval', async () => {
    const verification = await verify({
      declared: ['workflow.execute'],
      actions: [
        action({
          toolId: 'workflow.execute',
          risk: 'HIGH',
          status: 'SUCCEEDED',
          approvalId: 'apr-1',
        }),
      ],
      tools: [usage('workflow.execute', 'HIGH')],
    });

    expect(verification.ok).toBe(true);
  });

  it('flags a step that never finished', async () => {
    const verification = await verify({
      actions: [action({ toolId: 'knowledge.search', risk: 'INFORMATIONAL', status: 'PLANNED' })],
    });

    expect(verification.ok).toBe(false);
    expect(verification.issues.join(' ')).toContain('tidak pernah selesai');
  });

  it('does not flag an unfinished step while the task waits for a human', async () => {
    const verification = await verify({
      declared: ['workflow.execute', 'knowledge.search'],
      actions: [
        action({ toolId: 'workflow.execute', risk: 'HIGH', status: 'AWAITING_APPROVAL' }),
        action({ toolId: 'knowledge.search', risk: 'INFORMATIONAL', status: 'PLANNED' }),
      ],
      status: 'AWAITING_APPROVAL',
    });

    expect(verification.ok).toBe(true);
  });
});

describe('cancellation', () => {
  it('cancels a task parked at a gate and reports it', async () => {
    const { orchestrator, actor, runtime } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const cancelled = await orchestrator.cancel(parked.taskId, actor, 'Diminta pengguna.');

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.errors.map((error) => error.code)).toContain('CANCELLED');
    expect(runtime.calls).toEqual([]);
    expect(statesVisited(cancelled)).toEqual([
      'UNDERSTANDING',
      'PLANNING',
      'APPROVAL',
      'REPORTING',
      'REMEMBERING',
      'CANCELLED',
    ]);
  });

  it('undoes reversible work when a running task is cancelled', async () => {
    const { orchestrator, actor, runtime, tasks } = harness({ tools: ['document.draft'] });
    const done = await orchestrator.start(
      { question: 'Buat draft ringkasan.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    // Rewind the record to mid-flight: the draft is written, the task has not
    // finished. This is the state a cancel has to clean up after.
    const inFlight: TaskReport = { ...done, status: 'EXECUTING' };
    await tasks.save(inFlight, actor);
    runtime.compensated.length = 0;

    const cancelled = await orchestrator.cancel(done.taskId, actor, 'Dibatalkan pengguna.');

    expect(cancelled.status).toBe('CANCELLED');
    expect(runtime.compensated).toEqual(['document.draft']);
    expect(cancelled.plan[0]?.status).toBe('COMPENSATED');
  });

  it('refuses to cancel a task that already ended', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });
    const done = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    await expect(orchestrator.cancel(done.taskId, actor, 'terlambat')).rejects.toThrow(
      /sudah berakhir/,
    );
  });

  it('refuses to act on a task belonging to someone else', async () => {
    const { orchestrator, actor } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const other = { ...actor, id: 'usr_other' };
    await expect(orchestrator.cancel(parked.taskId, other, 'bukan miliknya')).rejects.toThrow(
      /tidak ditemukan/,
    );
  });
});

describe('impossible moves fail loudly', () => {
  it('throws rather than forcing a task into a state the table forbids', async () => {
    const { orchestrator, actor, tasks } = harness({ tools: ['knowledge.search'] });
    const done = await orchestrator.start({ question: QUESTION, sessionId: 'conv-1' }, actor, 'req-1');

    // REPORTING → REPORTING is not a legal move; a cancel from there must not
    // quietly rewrite the record.
    await tasks.save({ ...done, status: 'REPORTING' }, actor);

    await expect(orchestrator.cancel(done.taskId, actor, 'apa pun')).rejects.toThrow(
      /Transisi tidak sah/,
    );
  });

  it('refuses a resume when the agent behind the task no longer exists', async () => {
    const { orchestrator, actor, tasks, approvals } = harness({ tools: ['workflow.execute'] });
    const parked = await orchestrator.start(
      { question: 'Jalankan workflow onboarding.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    await approvals.decide(parked.pendingApprovalId as string, 'APPROVED', actor);
    await tasks.save({ ...parked, agents: ['agent.retired'] }, actor);

    await expect(orchestrator.resume(parked.taskId, actor, 'req-2')).rejects.toThrow(
      /tidak ditemukan untuk melanjutkan tugas/,
    );
  });
});


// ── Verifier fixtures ────────────────────────────────────────────────────────

function action(
  input: Pick<PlannedAction, 'toolId' | 'risk' | 'status'> & { approvalId?: string },
): PlannedAction {
  return {
    id: `act-${input.toolId}`,
    label: input.toolId,
    toolId: input.toolId,
    agentId: 'agent.test',
    risk: input.risk,
    riskCode: RISK_CODE[input.risk],
    status: input.status,
    reversible: false,
    ...(input.approvalId === undefined ? {} : { approvalId: input.approvalId }),
  };
}

function usage(toolId: string, risk: RiskLevel): ToolUsage {
  return { toolId, name: toolId, risk, status: 'SUCCEEDED', summary: 'dijalankan' };
}

/** Runs the governance verifier over a handcrafted outcome. */
async function verify(input: {
  actions?: PlannedAction[];
  tools?: ToolUsage[];
  status?: ExecutionOutcome['status'];
  /** What the agent declared; defaults to a read-only agent. */
  declared?: string[];
}) {
  const agent = new ScriptedAgent(
    'agent.test',
    'Test Agent',
    input.declared ?? ['knowledge.search'],
    'LOW',
  );

  const context = {
    taskId: 'task-1',
    sessionId: 'conv-1',
    correlationId: 'req-1',
    actor: DEMO_ACTOR,
    agent,
    question: QUESTION,
    intent: 'ANALYZE',
  } as TaskContext;

  return new PlanVerificationManager().verify({
    context,
    outcome: {
      actions: input.actions ?? [],
      tools: input.tools ?? [],
      trace: [],
      evidence: [],
      artifacts: [],
      errors: [],
      status: input.status ?? 'SUCCEEDED',
    },
  });
}
