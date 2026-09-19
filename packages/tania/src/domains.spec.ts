import { describe, expect, it } from 'vitest';
import { hasAllScopes, hasScope, missingScopes, type Actor } from './identity/index.js';
import { agentAcceptsRisk, agentCanUseTool, type AgentDefinition } from './orchestration/index.js';
import { requiresApproval } from './governance/index.js';
import { summariseTrace } from './verification/index.js';
import type { TraceStep } from '@tania/types';

const actor: Actor = {
  id: 'actor-1',
  subject: 'usr_henri',
  issuer: 'urn:tania:portal',
  name: 'Henri',
  email: 'henri@dps.telkom.example',
  clearance: 'CONFIDENTIAL',
  scopes: ['knowledge:read', 'workflow:run'],
};

const admin: Actor = { ...actor, id: 'actor-2', scopes: ['system:admin'] };

const agent: AgentDefinition = {
  id: 'agent.performance',
  name: 'Performance Agent',
  domain: 'Kinerja & Delivery',
  description: 'Monitors delivery performance.',
  capabilities: [
    {
      id: 'performance.analyze',
      label: 'Analyse performance',
      intents: ['ANALYZE'],
      keywords: ['kinerja', 'performance'],
      stage: 'REASON',
    },
  ],
  stages: ['UNDERSTAND', 'REASON'],
  requiredTools: ['analytics.query', 'document.draft'],
  riskLevel: 'MEDIUM',
  status: 'ACTIVE',
  owner: 'Delivery Management',
};

describe('identity scopes', () => {
  it('grants a held scope', () => {
    expect(hasScope(actor, 'knowledge:read')).toBe(true);
  });

  it('denies a scope that is not held', () => {
    expect(hasScope(actor, 'workflow:approve')).toBe(false);
  });

  it('treats system:admin as covering every scope', () => {
    expect(hasScope(admin, 'workflow:approve')).toBe(true);
    expect(hasAllScopes(admin, ['audit:read', 'document:create'])).toBe(true);
  });

  it('lists exactly what is missing', () => {
    expect(missingScopes(actor, ['knowledge:read', 'workflow:approve', 'audit:read'])).toEqual([
      'workflow:approve',
      'audit:read',
    ]);
  });
});

describe('agent boundaries', () => {
  it('allows only declared tools', () => {
    expect(agentCanUseTool(agent, 'analytics.query')).toBe(true);
    expect(agentCanUseTool(agent, 'workflow.execute')).toBe(false);
  });

  it('refuses work above the declared risk ceiling', () => {
    expect(agentAcceptsRisk(agent, 'MEDIUM')).toBe(true);
    expect(agentAcceptsRisk(agent, 'HIGH')).toBe(false);
  });
});

describe('governance threshold', () => {
  it('gates at and above the threshold', () => {
    expect(requiresApproval('HIGH', 'HIGH')).toBe(true);
    expect(requiresApproval('CRITICAL', 'HIGH')).toBe(true);
    expect(requiresApproval('MEDIUM', 'HIGH')).toBe(false);
  });

  it('follows a lowered threshold', () => {
    expect(requiresApproval('MEDIUM', 'MEDIUM')).toBe(true);
  });
});

describe('trace summary', () => {
  const steps: TraceStep[] = [
    { id: '1', label: 'understand', stage: 'UNDERSTAND', status: 'SUCCEEDED', durationMs: 5 },
    { id: '2', label: 'retrieve', stage: 'KNOW', status: 'SUCCEEDED', durationMs: 12 },
    { id: '3', label: 'execute', stage: 'ACT', status: 'AWAITING_APPROVAL' },
  ];

  it('counts statuses and stages without losing steps', () => {
    const summary = summariseTrace(steps);

    expect(summary.total).toBe(3);
    expect(summary.byStatus.SUCCEEDED).toBe(2);
    expect(summary.byStatus.AWAITING_APPROVAL).toBe(1);
    expect(summary.byStatus.FAILED).toBe(0);
    expect(summary.stages).toEqual(['UNDERSTAND', 'KNOW', 'ACT']);
    expect(summary.totalDurationMs).toBe(17);
  });

  it('handles an empty trace', () => {
    expect(summariseTrace([]).total).toBe(0);
  });
});
