import { describe, expect, it } from 'vitest';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import { evaluatePolicy, isAtLeast } from '@/lib/tania/tools/policy';

const options = { approvalThreshold: 'HIGH' } as const;

describe('tool policy', () => {
  it('denies tools that are not in the registry', () => {
    const decision = evaluatePolicy('shell.exec', DEMO_ACTOR, options);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('not registered');
  });

  it('denies tools when the actor lacks a required scope', () => {
    const decision = evaluatePolicy('system.broadcast', DEMO_ACTOR, options);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('system:admin');
  });

  it('allows low risk tools without approval', () => {
    const decision = evaluatePolicy('analytics.query', DEMO_ACTOR, options);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  it('requires approval from the configured risk threshold', () => {
    const decision = evaluatePolicy('workflow.execute', DEMO_ACTOR, options);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it('lowers the gate when the threshold is lowered', () => {
    const decision = evaluatePolicy('document.draft', DEMO_ACTOR, {
      approvalThreshold: 'MEDIUM',
    });
    expect(decision.requiresApproval).toBe(true);
  });

  it('ranks risk levels', () => {
    expect(isAtLeast('CRITICAL', 'HIGH')).toBe(true);
    expect(isAtLeast('LOW', 'HIGH')).toBe(false);
  });
});
