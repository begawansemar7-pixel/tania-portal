import { describe, expect, it } from 'vitest';
import { canAccessClassification, isClassification } from './classification.js';
import { highestRisk, isAtLeastRisk, isRiskLevel } from './risk.js';
import { aggregateHealth } from './health.js';
import { isCorrelationId } from './correlation.js';
import { isTerminalTraceStatus } from './trace.js';
import { isIntent } from './intent.js';

describe('risk ladder', () => {
  it('orders levels', () => {
    expect(isAtLeastRisk('CRITICAL', 'HIGH')).toBe(true);
    expect(isAtLeastRisk('LOW', 'HIGH')).toBe(false);
    expect(isAtLeastRisk('HIGH', 'HIGH')).toBe(true);
  });

  it('picks the highest risk of a plan', () => {
    expect(highestRisk(['INFORMATIONAL', 'HIGH', 'LOW'])).toBe('HIGH');
    expect(highestRisk([])).toBe('INFORMATIONAL');
  });

  it('validates values', () => {
    expect(isRiskLevel('MEDIUM')).toBe(true);
    expect(isRiskLevel('SPICY')).toBe(false);
  });
});

describe('classification ladder', () => {
  it('allows reading at or below clearance', () => {
    expect(canAccessClassification('CONFIDENTIAL', 'INTERNAL')).toBe(true);
    expect(canAccessClassification('CONFIDENTIAL', 'CONFIDENTIAL')).toBe(true);
  });

  it('never allows reading above clearance', () => {
    expect(canAccessClassification('INTERNAL', 'CONFIDENTIAL')).toBe(false);
    expect(canAccessClassification('CONFIDENTIAL', 'RESTRICTED')).toBe(false);
  });

  it('validates values', () => {
    expect(isClassification('RESTRICTED')).toBe(true);
    expect(isClassification('SECRET')).toBe(false);
  });
});

describe('health aggregation', () => {
  it('reports the worst dependency state', () => {
    expect(aggregateHealth([{ name: 'db', state: 'ok' }])).toBe('ok');
    expect(
      aggregateHealth([
        { name: 'db', state: 'ok' },
        { name: 'cache', state: 'degraded' },
      ]),
    ).toBe('degraded');
    expect(
      aggregateHealth([
        { name: 'db', state: 'down' },
        { name: 'cache', state: 'degraded' },
      ]),
    ).toBe('down');
  });

  it('is ok with no dependencies', () => {
    expect(aggregateHealth([])).toBe('ok');
  });
});

describe('misc guards', () => {
  it('validates correlation ids', () => {
    expect(isCorrelationId('3f6d0b1e-6f1a-4a7e-9f1b-2c9a0d1e4b77')).toBe(true);
    expect(isCorrelationId('not-a-uuid')).toBe(false);
  });

  it('knows terminal trace statuses', () => {
    expect(isTerminalTraceStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalTraceStatus('AWAITING_APPROVAL')).toBe(false);
  });

  it('validates intents', () => {
    expect(isIntent('AUTOMATE')).toBe(true);
    expect(isIntent('DANCE')).toBe(false);
  });
});
