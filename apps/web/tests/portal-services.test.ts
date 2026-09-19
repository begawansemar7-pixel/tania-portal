import { describe, expect, it } from 'vitest';
import { MockAgentService, MockDashboardService, MockDataError } from '@/lib/portal/mock/services';
import { parseSimulatedState } from '@/lib/portal/services';

describe('simulated states', () => {
  it('defaults to ok for anything unrecognised', () => {
    expect(parseSimulatedState(undefined)).toBe('ok');
    expect(parseSimulatedState('nonsense')).toBe('ok');
    expect(parseSimulatedState('empty')).toBe('empty');
    expect(parseSimulatedState('error')).toBe('error');
  });
});

describe('MockDashboardService', () => {
  const service = new MockDashboardService();

  it('returns a populated snapshot by default', async () => {
    const snapshot = await service.getSnapshot();

    expect(snapshot.kpis.length).toBeGreaterThan(0);
    expect(snapshot.portfolio.length).toBeGreaterThan(0);
    expect(snapshot.initiatives.length).toBeGreaterThan(0);
    expect(snapshot.risks.length).toBeGreaterThan(0);
    expect(snapshot.insights.length).toBeGreaterThan(0);
    expect(snapshot.recentTasks.length).toBeGreaterThan(0);
    expect(Date.parse(snapshot.generatedAt)).not.toBeNaN();
  });

  it('returns empty collections so screens can render their empty state', async () => {
    const snapshot = await service.getSnapshot({ simulate: 'empty' });

    expect(snapshot.kpis).toEqual([]);
    expect(snapshot.portfolio).toEqual([]);
    expect(snapshot.recentTasks).toEqual([]);
  });

  it('throws a named error so screens can render their error state', async () => {
    await expect(service.getSnapshot({ simulate: 'error' })).rejects.toBeInstanceOf(MockDataError);
    await expect(service.getSnapshot({ simulate: 'error' })).rejects.toThrow(/dashboard/);
  });

  it('keeps every KPI describable: label, value, delta and caption', async () => {
    const { kpis } = await service.getSnapshot();

    for (const kpi of kpis) {
      expect(kpi.label).not.toHaveLength(0);
      expect(kpi.value).not.toHaveLength(0);
      expect(kpi.delta).not.toHaveLength(0);
      expect(kpi.caption).not.toHaveLength(0);
    }
  });
});

describe('MockAgentService', () => {
  const service = new MockAgentService();

  it('projects the agent registry with its allowed tools', async () => {
    const agents = await service.listAgents();

    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.tools.length).toBeGreaterThan(0);
      for (const tool of agent.tools) {
        expect(tool.name).not.toBe(tool.toolId);
      }
    }
  });

  it('supports the empty state', async () => {
    await expect(service.listAgents({ simulate: 'empty' })).resolves.toEqual([]);
  });
});
