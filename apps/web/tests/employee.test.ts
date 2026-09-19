import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_INFO,
  CATEGORY_FOR_INTENT,
  WORK_GROUPS,
  highestCategory,
  isCapabilityCategory,
  workGroupFor,
  type TaskReport,
} from '@tania/types';
import { TASK_STATES } from '@tania/types';
import {
  DetectorInsightService,
  KpiAnomalyDetector,
  NewDocumentDetector,
  OverdueTaskDetector,
  PerformanceChangeDetector,
  ProjectRiskDetector,
  parseDelta,
} from '@/lib/insights';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import type { Initiative, KpiMetric, RiskItem } from '@/lib/portal/types';
import { processSingleton, resetProcessSingleton } from '@/lib/tania/process-state';

const NOW = new Date('2026-09-19T00:00:00.000Z');
const context = { actor: DEMO_ACTOR, now: NOW };

describe('capability categories', () => {
  it('names the six', () => {
    expect([...CAPABILITY_CATEGORIES]).toEqual([
      'KNOW',
      'ANALYZE',
      'CREATE',
      'RECOMMEND',
      'EXECUTE',
      'MONITOR',
    ]);
  });

  it('describes each one, and says which can change the world', () => {
    for (const category of CAPABILITY_CATEGORIES) {
      const info = CAPABILITY_CATEGORY_INFO[category];
      expect(info.label, category).toBeTruthy();
      expect(info.description, category).toBeTruthy();
    }

    // Exactly one category changes state, and it is the gated one.
    const changing = CAPABILITY_CATEGORIES.filter(
      (category) => CAPABILITY_CATEGORY_INFO[category].changesState,
    );
    expect(changing).toEqual(['EXECUTE']);
    expect(CAPABILITY_CATEGORY_INFO.EXECUTE.typicalRisk).toBe('HIGH');
  });

  it('maps an unclassified question to knowing, not to doing', () => {
    expect(CATEGORY_FOR_INTENT.CONVERSE).toBe('KNOW');
    expect(CATEGORY_FOR_INTENT.SEARCH).toBe('KNOW');
    expect(CATEGORY_FOR_INTENT.AUTOMATE).toBe('EXECUTE');
  });

  it('labels a task by the most consequential thing it did', () => {
    expect(highestCategory(['KNOW', 'ANALYZE', 'EXECUTE'])).toBe('EXECUTE');
    expect(highestCategory(['KNOW', 'ANALYZE'])).toBe('ANALYZE');
    // Monitoring accompanies work rather than ranking against it.
    expect(highestCategory(['MONITOR', 'KNOW'])).toBe('KNOW');
    expect(highestCategory([])).toBeUndefined();
  });

  it('rejects a category it does not know', () => {
    expect(isCapabilityCategory('DELEGATE')).toBe(false);
  });
});

describe('work groups', () => {
  it('puts every lifecycle state in exactly one tray', () => {
    for (const state of TASK_STATES) {
      expect(WORK_GROUPS, state).toContain(workGroupFor(state));
    }
  });

  it('groups by what the person must do, not by lifecycle', () => {
    expect(workGroupFor('EXECUTING')).toBe('IN_PROGRESS');
    expect(workGroupFor('APPROVAL')).toBe('PENDING_APPROVAL');
    expect(workGroupFor('COMPLETED')).toBe('COMPLETED');

    // From this side these are all "this did not happen".
    expect(workGroupFor('FAILED')).toBe('FAILED');
    expect(workGroupFor('BLOCKED')).toBe('FAILED');
    expect(workGroupFor('CANCELLED')).toBe('FAILED');
  });
});

describe('KPI anomaly detector', () => {
  const metric = (overrides: Partial<KpiMetric> = {}): KpiMetric => ({
    id: 'kpi-1',
    label: 'Revenue',
    value: 'Rp 12,4 M',
    delta: '-14,2%',
    trend: 'down',
    deltaIsGood: false,
    caption: 'vs kuartal lalu',
    ...overrides,
  });

  it('notices a large move in the wrong direction', () => {
    const found = new KpiAnomalyDetector().detect([metric()], context);

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('ATTENTION');
    expect(found[0]?.category).toBe('ANALYZE');
    expect(found[0]?.suggestedPrompt).toContain('Revenue');
  });

  it('ignores a large move in the right direction', () => {
    // Churn falling is good; a detector that cannot tell generates noise.
    expect(new KpiAnomalyDetector().detect([metric({ deltaIsGood: true })], context)).toEqual([]);
  });

  it('ignores ordinary movement', () => {
    expect(new KpiAnomalyDetector().detect([metric({ delta: '-2,1%' })], context)).toEqual([]);
  });

  it('escalates a very large move', () => {
    const found = new KpiAnomalyDetector().detect([metric({ delta: '-31,0%' })], context);
    expect(found[0]?.severity).toBe('URGENT');
  });

  it('reads a delta whatever the decimal separator', () => {
    expect(parseDelta('-14,2%')).toBeCloseTo(-14.2);
    expect(parseDelta('+8.5%')).toBeCloseTo(8.5);
    expect(parseDelta('stabil')).toBeUndefined();
  });
});

describe('overdue task detector', () => {
  const initiative = (overrides: Partial<Initiative> = {}): Initiative => ({
    id: 'init-1',
    code: 'DPS-14',
    name: 'Partner marketplace',
    owner: 'Rani',
    squad: 'Platform',
    status: 'NEEDS_ATTENTION',
    progressPct: 60,
    milestone: 'Pilot readiness',
    dueDate: '2026-09-01',
    risk: 'MEDIUM',
    ...overrides,
  });

  it('notices a milestone that has passed unfinished', () => {
    const found = new OverdueTaskDetector().detect([initiative()], context);

    expect(found).toHaveLength(1);
    expect(found[0]?.headline).toContain('18 hari');
    expect(found[0]?.severity).toBe('URGENT');
  });

  it('says nothing about work that is finished', () => {
    expect(new OverdueTaskDetector().detect([initiative({ progressPct: 100 })], context)).toEqual(
      [],
    );
  });

  it('says nothing about work that is not due yet', () => {
    expect(
      new OverdueTaskDetector().detect([initiative({ dueDate: '2026-12-01' })], context),
    ).toEqual([]);
  });
});

describe('project risk detector', () => {
  const risk = (overrides: Partial<RiskItem> = {}): RiskItem => ({
    id: 'risk-1',
    title: 'Ketergantungan vendor tunggal',
    category: 'Supply',
    impact: 'HIGH',
    likelihood: 'HIGH',
    owner: 'Budi',
    mitigation: 'Mencari vendor kedua',
    status: 'OPEN',
    reviewBy: '2026-09-30',
    ...overrides,
  });

  it('surfaces a severe risk that is also likely', () => {
    const found = new ProjectRiskDetector().detect([risk()], context);

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('URGENT');
    expect(found[0]?.category).toBe('RECOMMEND');
  });

  it('surfaces a severe risk whose review is overdue', () => {
    const found = new ProjectRiskDetector().detect(
      [risk({ likelihood: 'LOW', reviewBy: '2026-08-01' })],
      context,
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('ATTENTION');
  });

  it('stays quiet about a severe risk already under review', () => {
    // The register already says it is severe; that alone is not news.
    expect(
      new ProjectRiskDetector().detect(
        [risk({ likelihood: 'LOW', reviewBy: '2026-12-01' })],
        context,
      ),
    ).toEqual([]);
  });

  it('stays quiet about a closed risk', () => {
    expect(new ProjectRiskDetector().detect([risk({ status: 'CLOSED' })], context)).toEqual([]);
  });
});

describe('new document detector', () => {
  const document = (updatedAt: string) => ({
    id: 'doc-1',
    title: 'Delivery Health Report',
    kind: 'REPORT' as const,
    source: 'DMO',
    owner: 'DMO',
    updatedAt,
    acl: { classification: 'INTERNAL' as const },
    summary: '',
    sections: [],
  });

  it('mentions a document added this week', () => {
    const found = new NewDocumentDetector().detect([document('2026-09-17')], context);

    expect(found).toHaveLength(1);
    expect(found[0]?.category).toBe('KNOW');
    expect(found[0]?.suggestedRisk).toBe('INFORMATIONAL');
  });

  it('says nothing about an old document', () => {
    expect(new NewDocumentDetector().detect([document('2026-06-01')], context)).toEqual([]);
  });
});

describe('performance change detector', () => {
  const task = (status: TaskReport['status'], code = 'TOOL_FAILED'): TaskReport =>
    ({
      taskId: `task-${status}-${Math.random()}`,
      sessionId: 'conv-1',
      question: 'q',
      intent: 'ANALYZE',
      status,
      plan: [],
      agents: [],
      tools: [],
      evidence: [],
      artifacts: [],
      verification: { ok: true, issues: [], checkedAt: '' },
      result: '',
      errors: status === 'COMPLETED' ? [] : [{ code, message: 'm', recoverable: true }],
      trace: [],
      risk: 'LOW',
      riskCode: 'L1',
      createdAt: '2026-09-18',
      updatedAt: '2026-09-18',
    }) as TaskReport;

  it('reports a run of failures', () => {
    const found = new PerformanceChangeDetector().detect(
      [task('FAILED'), task('FAILED'), task('COMPLETED'), task('COMPLETED')],
      context,
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('URGENT');
    expect(found[0]?.detail).toContain('TOOL_FAILED');
  });

  it('will not call a single failure a trend', () => {
    // Claiming one would be exactly the unsupported assertion this avoids.
    expect(new PerformanceChangeDetector().detect([task('FAILED')], context)).toEqual([]);
  });

  it('stays quiet when things are going fine', () => {
    const fine = [task('COMPLETED'), task('COMPLETED'), task('COMPLETED'), task('COMPLETED')];
    expect(new PerformanceChangeDetector().detect(fine, context)).toEqual([]);
  });
});

describe('the insight service', () => {
  function service(overrides: Partial<Parameters<typeof makeSources>[0]> = {}) {
    return new DetectorInsightService(makeSources(overrides));
  }

  function makeSources(overrides: Record<string, unknown> = {}) {
    return {
      kpis: async () => [],
      initiatives: async () => [],
      risks: async () => [],
      documents: async () => [],
      tasks: async () => [],
      ...overrides,
    } as never;
  }

  it('keeps what it found and lists it by urgency', async () => {
    const insights = service({
      kpis: async () => [
        {
          id: 'kpi-1',
          label: 'Revenue',
          value: 'x',
          delta: '-31%',
          trend: 'down',
          deltaIsGood: false,
          caption: '',
        },
      ],
      initiatives: async () => [
        {
          id: 'init-1',
          code: 'DPS-1',
          name: 'n',
          owner: 'o',
          squad: 's',
          status: 'AT_RISK',
          progressPct: 10,
          milestone: 'm',
          dueDate: '2026-09-18',
          risk: 'LOW',
        },
      ],
    });

    const found = await insights.scan(context);

    expect(found.length).toBe(2);
    // Most urgent first: that is the order a person should read them.
    expect(found[0]?.severity).toBe('URGENT');
  });

  it('does not report the same subject twice', async () => {
    const insights = service({
      kpis: async () => [
        {
          id: 'kpi-1',
          label: 'Revenue',
          value: 'x',
          delta: '-31%',
          trend: 'down',
          deltaIsGood: false,
          caption: '',
        },
      ],
    });

    await insights.scan(context);
    const second = await insights.scan(context);

    // The same anomaly reported five times is how people learn to ignore it.
    expect(second).toEqual([]);
    expect(await insights.list(DEMO_ACTOR)).toHaveLength(1);
  });

  it('survives a detector that throws', async () => {
    const insights = service({
      kpis: async () => {
        throw new Error('sumber KPI mati');
      },
      initiatives: async () => [
        {
          id: 'init-1',
          code: 'DPS-1',
          name: 'n',
          owner: 'o',
          squad: 's',
          status: 'AT_RISK',
          progressPct: 10,
          milestone: 'm',
          dueDate: '2026-09-18',
          risk: 'LOW',
        },
      ],
    });

    const found = await insights.scan(context);

    // One broken detector must not cost the person every other insight.
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('OVERDUE_TASK');
  });

  it('hides a dismissed insight', async () => {
    const insights = service({
      initiatives: async () => [
        {
          id: 'init-1',
          code: 'DPS-1',
          name: 'n',
          owner: 'o',
          squad: 's',
          status: 'AT_RISK',
          progressPct: 10,
          milestone: 'm',
          dueDate: '2026-09-18',
          risk: 'LOW',
        },
      ],
    });

    const [found] = await insights.scan(context);
    await insights.dismiss((found as { id: string }).id, DEMO_ACTOR);

    expect(await insights.list(DEMO_ACTOR)).toEqual([]);
    expect(await insights.list(DEMO_ACTOR, { includeDismissed: true })).toHaveLength(1);
  });

  it('keeps one actor out of another actor insights', async () => {
    const insights = service({
      initiatives: async () => [
        {
          id: 'init-1',
          code: 'DPS-1',
          name: 'n',
          owner: 'o',
          squad: 's',
          status: 'AT_RISK',
          progressPct: 10,
          milestone: 'm',
          dueDate: '2026-09-18',
          risk: 'LOW',
        },
      ],
    });

    await insights.scan(context);
    const other = { ...DEMO_ACTOR, id: 'usr_other' };

    expect(await insights.list(other)).toEqual([]);
  });

  it('never suggests a follow-up that changes state on its own', async () => {
    const insights = service({
      kpis: async () => [
        {
          id: 'kpi-1',
          label: 'Revenue',
          value: 'x',
          delta: '-31%',
          trend: 'down',
          deltaIsGood: false,
          caption: '',
        },
      ],
    });

    const found = await insights.scan(context);

    // An insight proposes; it must never make a state change one click away.
    for (const insight of found) {
      expect(['INFORMATIONAL', 'LOW', 'MEDIUM']).toContain(insight.suggestedRisk);
      expect(insight.suggestedPrompt.length).toBeGreaterThan(0);
    }
  });
});

describe('state shared across the process', () => {
  it('hands the same instance to every bundle that asks', () => {
    // Next bundles pages and route handlers separately, so two modules hold
    // two different factory functions for the same logical store.
    const first = processSingleton('test.store', () => ({ items: [] as string[] }));
    const second = processSingleton('test.store', () => ({ items: ['different'] }));

    first.items.push('written by the route handler');

    expect(second).toBe(first);
    expect(second.items).toEqual(['written by the route handler']);
  });

  it('creates a fresh instance once the entry is cleared', () => {
    const before = processSingleton('test.reset', () => ({ id: 1 }));
    resetProcessSingleton('test.reset');
    const after = processSingleton('test.reset', () => ({ id: 2 }));

    expect(after).not.toBe(before);
    expect(after.id).toBe(2);
  });
});
