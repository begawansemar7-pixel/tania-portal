import { describe, expect, it } from 'vitest';
import {
  TASK_TRANSITIONS,
  canTransition,
} from '@tania/core/orchestration';
import {
  TASK_STATES,
  TERMINAL_TASK_STATES,
  isTerminalTaskState,
  requiresHumanApproval,
  RISK_CODE,
  type TaskState,
} from '@tania/types';
import { harness, statesVisited } from './helpers/task-harness';

describe('task state machine', () => {
  it('declares a transition list for every state', () => {
    for (const state of TASK_STATES) {
      expect(TASK_TRANSITIONS[state], state).toBeDefined();
    }
    expect(Object.keys(TASK_TRANSITIONS).sort()).toEqual([...TASK_STATES].sort());
  });

  it('never names a target outside the state list', () => {
    const known = new Set<string>(TASK_STATES);
    for (const [from, targets] of Object.entries(TASK_TRANSITIONS)) {
      for (const target of targets) {
        expect(known.has(target), `${from} → ${target}`).toBe(true);
      }
    }
  });

  it('lets nothing run after a terminal state', () => {
    for (const state of TERMINAL_TASK_STATES) {
      expect(TASK_TRANSITIONS[state], state).toEqual([]);
      expect(isTerminalTaskState(state)).toBe(true);
    }
  });

  it('reaches a terminal state only from REMEMBERING', () => {
    for (const [from, targets] of Object.entries(TASK_TRANSITIONS)) {
      const terminal = targets.filter((target) => isTerminalTaskState(target));
      if (from === 'REMEMBERING') {
        expect(terminal.sort()).toEqual([...TERMINAL_TASK_STATES].sort());
      } else {
        expect(terminal, `${from} must not end a task directly`).toEqual([]);
      }
    }
  });

  it('funnels every unfinished state into REPORTING', () => {
    const exempt = new Set<TaskState>(['REPORTING', 'REMEMBERING', ...TERMINAL_TASK_STATES]);

    for (const state of TASK_STATES) {
      if (exempt.has(state)) continue;
      expect(canTransition(state, 'REPORTING'), `${state} → REPORTING`).toBe(true);
    }

    expect(canTransition('REPORTING', 'REMEMBERING')).toBe(true);
  });

  it('rejects the moves that would skip a stage', () => {
    expect(canTransition('REQUESTED', 'EXECUTING')).toBe(false);
    expect(canTransition('PLANNING', 'VERIFYING')).toBe(false);
    expect(canTransition('VERIFYING', 'COMPLETED')).toBe(false);
    expect(canTransition('EXECUTING', 'COMPLETED')).toBe(false);
    expect(canTransition('REPORTING', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'EXECUTING')).toBe(false);
    expect(canTransition('CANCELLED', 'REPORTING')).toBe(false);
  });

  it('allows a gate to be entered again for a second decision', () => {
    expect(canTransition('APPROVAL', 'APPROVAL')).toBe(true);
    expect(canTransition('EXECUTING', 'APPROVAL')).toBe(true);
  });
});

describe('happy path lifecycle', () => {
  it('walks the stages in order and ends COMPLETED', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(statesVisited(report)).toEqual([
      'UNDERSTANDING',
      'PLANNING',
      'EXECUTING',
      'VERIFYING',
      'REPORTING',
      'REMEMBERING',
      'COMPLETED',
    ]);
    expect(report.status).toBe('COMPLETED');
    expect(report.verification.ok).toBe(true);
  });

  it('produces the agreed execution trace shape', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.taskId).toBeTruthy();
    expect(report.intent).toBe('ANALYZE');
    expect(report.plan).toHaveLength(1);
    expect(report.agents).toEqual(['agent.test']);
    expect(report.tools.map((tool) => tool.toolId)).toEqual(['knowledge.search']);
    expect(report.evidence).toHaveLength(1);
    expect(report.result).toContain('Tugas selesai');
    expect(report.errors).toEqual([]);
    expect(report.riskCode).toBe(RISK_CODE.INFORMATIONAL);
  });

  it('remembers the outcome and stores it under the task', async () => {
    const { orchestrator, memory, actor } = harness({ tools: ['knowledge.search'] });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const recalled = await memory.recall({ sessionId: report.sessionId, limit: 10 }, actor);
    expect(recalled).toHaveLength(1);
    expect(recalled[0]?.key).toBe(`task.${report.taskId}`);
    expect(recalled[0]?.value).toContain('COMPLETED');
  });

  it('keeps one actor out of another actor task', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });
    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const other = { ...actor, id: 'usr_other' };
    expect(await orchestrator.get(report.taskId, other)).toBeUndefined();
    expect(await orchestrator.get(report.taskId, actor)).toBeDefined();
  });

  it('hands out a copy, so a stored report cannot change under the caller', async () => {
    const { orchestrator, tasks, actor } = harness({ tools: ['knowledge.search'] });
    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    report.result = 'diubah oleh pemanggil';
    report.plan.length = 0;

    const stored = await tasks.get(report.taskId, actor);
    expect(stored?.result).toContain('Tugas selesai');
    expect(stored?.plan).toHaveLength(1);
  });

  it('caps plan risk when the request asks for a lower ceiling', async () => {
    const { orchestrator, actor, runtime } = harness({
      tools: ['knowledge.search', 'workflow.execute'],
    });

    const report = await orchestrator.start(
      { question: 'Jalankan workflow uji.', sessionId: 'conv-1', maxRisk: 'LOW' },
      actor,
      'req-1',
    );

    const gated = report.plan.find((action) => action.toolId === 'workflow.execute');
    expect(gated?.status).toBe('BLOCKED');
    expect(gated?.detail).toContain('melebihi batas L1');
    expect(runtime.calls).not.toContain('workflow.execute');
    expect(report.status).toBe('COMPLETED');
  });
});

describe('what a task report exposes', () => {
  /** The whole permitted surface. Anything else would be a leak. */
  const ALLOWED_REPORT_KEYS = new Set([
    'taskId',
    'sessionId',
    'question',
    'intent',
    'status',
    'plan',
    'agents',
    'tools',
    'evidence',
    'artifacts',
    'category',
    'wantsArtifact',
    'verification',
    'result',
    'errors',
    'trace',
    'risk',
    'riskCode',
    'createdAt',
    'updatedAt',
    'pendingApprovalId',
  ]);

  const ALLOWED_ACTION_KEYS = new Set([
    'id',
    'label',
    'toolId',
    'agentId',
    'risk',
    'riskCode',
    'status',
    'reversible',
    'attempts',
    'approvalId',
    'detail',
  ]);

  it('exposes status, plan, tools, evidence, result and errors — and nothing else', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    for (const key of Object.keys(report)) {
      expect(ALLOWED_REPORT_KEYS.has(key), `unexpected report field: ${key}`).toBe(true);
    }
    for (const action of report.plan) {
      for (const key of Object.keys(action)) {
        expect(ALLOWED_ACTION_KEYS.has(key), `unexpected plan field: ${key}`).toBe(true);
      }
    }
  });

  it('carries no field that would hold hidden reasoning', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });

    const report = await orchestrator.start(
      { question: 'Analisa performance product X.', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    const serialised = JSON.stringify(report);
    for (const forbidden of ['reasoning', 'chainOfThought', 'thought', 'deliberation', 'prompt']) {
      expect(serialised.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('risk codes', () => {
  it('maps the five levels to L0–L4', () => {
    expect(RISK_CODE).toEqual({
      INFORMATIONAL: 'L0',
      LOW: 'L1',
      MEDIUM: 'L2',
      HIGH: 'L3',
      CRITICAL: 'L4',
    });
  });

  it('requires a human decision for L3 and L4 only', () => {
    expect(requiresHumanApproval('INFORMATIONAL')).toBe(false);
    expect(requiresHumanApproval('LOW')).toBe(false);
    expect(requiresHumanApproval('MEDIUM')).toBe(false);
    expect(requiresHumanApproval('HIGH')).toBe(true);
    expect(requiresHumanApproval('CRITICAL')).toBe(true);
  });
});

describe('TANIA as an employee', () => {
  it('walks the nine steps of a request that asks for an artifact', async () => {
    const { orchestrator, actor } = harness({
      tools: ['knowledge.search', 'analytics.query', 'document.draft'],
    });

    const report = await orchestrator.start(
      {
        question: 'Siapkan ringkasan eksekutif kinerja produk terbaru.',
        sessionId: 'conv-1',
        wantsArtifact: true,
      },
      actor,
      'req-1',
    );

    // 1 understand · 2–3 identify and retrieve · 4 analyse · 5–6 generate
    expect(report.intent).toBeTruthy();
    expect(report.plan.map((action) => action.toolId)).toEqual([
      'knowledge.search',
      'analytics.query',
      'document.draft',
    ]);
    expect(report.evidence.length).toBeGreaterThan(0);

    // 6 create the artifact · 7 verify it
    expect(report.artifacts).toHaveLength(1);
    expect(report.artifacts[0]?.producedBy).toBe('document.draft');
    expect(report.artifacts[0]?.verified).toBe(true);
    expect(report.verification.ok).toBe(true);

    // 8 present · 9 store
    expect(report.result).toContain('artefak dihasilkan');
    expect(report.status).toBe('COMPLETED');
    expect(report.category).toBeTruthy();
  });

  it('fails a task that promised an artifact and produced none', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search'] });

    const report = await orchestrator.start(
      { question: 'Siapkan ringkasan eksekutif.', sessionId: 'conv-1', wantsArtifact: true },
      actor,
      'req-1',
    );

    // Every step ran cleanly, and the task still did not do what was asked.
    expect(report.status).toBe('FAILED');
    expect(report.verification.issues.join(' ')).toContain('Artefak diminta');
  });

  it('does not produce an artifact nobody asked for', async () => {
    const { orchestrator, actor } = harness({ tools: ['knowledge.search', 'analytics.query'] });

    const report = await orchestrator.start(
      { question: 'Bagaimana kinerja produk?', sessionId: 'conv-1' },
      actor,
      'req-1',
    );

    expect(report.artifacts).toEqual([]);
    expect(report.status).toBe('COMPLETED');
  });
});
