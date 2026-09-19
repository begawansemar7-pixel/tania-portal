import { describe, expect, it } from 'vitest';
import { buildHealthReport } from './health.js';

const base = {
  service: 'tania.api',
  version: '0.1.0',
  environment: 'test',
  startedAt: new Date('2026-09-19T09:59:00.000Z'),
  now: () => new Date('2026-09-19T10:00:00.000Z'),
};

describe('buildHealthReport', () => {
  it('reports ok with no dependencies', async () => {
    const report = await buildHealthReport(base);

    expect(report.state).toBe('ok');
    expect(report.uptimeSeconds).toBe(60);
    expect(report.dependencies).toEqual([]);
  });

  it('aggregates the worst dependency state', async () => {
    const report = await buildHealthReport({
      ...base,
      probes: [
        { name: 'database', check: () => ({ state: 'ok' }) },
        { name: 'cache', check: () => ({ state: 'degraded', detail: 'high latency' }) },
      ],
    });

    expect(report.state).toBe('degraded');
    expect(report.dependencies.map((dependency) => dependency.name)).toEqual(['database', 'cache']);
  });

  it('isolates a throwing probe instead of failing the report', async () => {
    const report = await buildHealthReport({
      ...base,
      probes: [
        {
          name: 'database',
          check: () => {
            throw new Error('connection refused');
          },
        },
      ],
    });

    expect(report.state).toBe('down');
    expect(report.dependencies[0]).toMatchObject({
      name: 'database',
      state: 'down',
      detail: 'connection refused',
    });
  });

  it('times a hanging probe out', async () => {
    const report = await buildHealthReport({
      ...base,
      probes: [{ name: 'slow', timeoutMs: 20, check: () => new Promise(() => {}) }],
    });

    expect(report.dependencies[0]?.state).toBe('down');
    expect(report.dependencies[0]?.detail).toContain('timed out');
  });
});
