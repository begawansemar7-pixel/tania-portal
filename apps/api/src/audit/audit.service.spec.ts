import { describe, expect, it } from 'vitest';
import { computeAuditHash, GENESIS_HASH } from './audit.service.js';

const base = {
  event: 'approval.decided',
  actorId: 'actor-1',
  sessionId: 'session-1',
  approvalId: 'approval-1',
  risk: 'HIGH' as const,
  payload: { decision: 'APPROVED', toolId: 'workflow.execute' },
  prevHash: GENESIS_HASH,
  occurredAt: new Date('2026-09-18T10:00:00.000Z'),
};

describe('computeAuditHash', () => {
  it('is deterministic for identical input', () => {
    expect(computeAuditHash(base)).toBe(computeAuditHash({ ...base }));
  });

  it('ignores payload key ordering', () => {
    const reordered = { ...base, payload: { toolId: 'workflow.execute', decision: 'APPROVED' } };
    expect(computeAuditHash(reordered)).toBe(computeAuditHash(base));
  });

  it.each([
    ['event', { event: 'approval.requested' }],
    ['actor', { actorId: 'actor-2' }],
    ['risk', { risk: 'CRITICAL' as const }],
    ['payload', { payload: { decision: 'REJECTED', toolId: 'workflow.execute' } }],
    ['previous hash', { prevHash: 'f'.repeat(64) }],
    ['timestamp', { occurredAt: new Date('2026-09-18T10:00:01.000Z') }],
  ])('changes when the %s changes', (_label, override) => {
    expect(computeAuditHash({ ...base, ...override })).not.toBe(computeAuditHash(base));
  });

  it('produces a sha256 hex digest', () => {
    expect(computeAuditHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
