import { describe, expect, it } from 'vitest';
import { createAgentStack, matchesKeyword } from '@/lib/agents';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';
import { TOOL_REGISTRY } from '@/lib/tania/tools/registry';
import type { Intent } from '@tania/types';

const { registry, router } = createAgentStack();

function route(message: string, intent: Intent, permittedTools?: string[]) {
  return router.route({
    message,
    intent,
    actor: DEMO_ACTOR,
    ...(permittedTools === undefined ? {} : { permittedTools }),
  });
}

describe('agent registry', () => {
  it('registers the nine specialist agents', () => {
    expect(registry.list().map((agent) => agent.id).sort()).toEqual([
      'agent.automation',
      'agent.business-case',
      'agent.documentation',
      'agent.knowledge',
      'agent.market-intelligence',
      'agent.performance',
      'agent.product',
      'agent.research',
      'agent.solution',
    ]);
  });

  it('refuses to register the same agent twice', () => {
    const duplicate = registry.list()[0];
    expect(duplicate).toBeDefined();
    expect(() => registry.register(duplicate!)).toThrow(/sudah terdaftar/);
  });

  it('only declares tools that exist in the controlled tool registry', () => {
    const known = new Set(TOOL_REGISTRY.map((tool) => tool.id));

    for (const agent of registry.list()) {
      expect(agent.requiredTools.length).toBeGreaterThan(0);
      for (const toolId of agent.requiredTools) {
        expect(known, `${agent.id} declares unknown tool ${toolId}`).toContain(toolId);
      }
    }
  });

  it('keeps every agent within its declared risk ceiling', () => {
    const risks = new Map(TOOL_REGISTRY.map((tool) => [tool.id, tool.risk]));
    const order = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    for (const agent of registry.list()) {
      for (const toolId of agent.requiredTools) {
        const risk = risks.get(toolId);
        expect(
          order.indexOf(risk ?? 'INFORMATIONAL'),
          `${agent.id} declares ${toolId} above its ceiling`,
        ).toBeLessThanOrEqual(order.indexOf(agent.riskLevel));
      }
    }
  });

  it('finds agents by tool and by intent', () => {
    expect(registry.forTool('document.draft').map((agent) => agent.id)).toEqual(
      expect.arrayContaining(['agent.solution', 'agent.documentation', 'agent.business-case']),
    );
    expect(registry.forIntent('CREATE').map((agent) => agent.id)).toEqual(
      expect.arrayContaining(['agent.documentation', 'agent.solution']),
    );
    expect(registry.find('agent.performance')?.name).toBe('Performance Agent');
    expect(registry.find('agent.nonexistent')).toBeUndefined();
  });

  it('never exposes an agent that can execute without tools', () => {
    for (const agent of registry.list()) {
      expect(agent.requiredTools.length).toBeGreaterThan(0);
    }
  });
});

describe('agent routing — the worked example', () => {
  it('routes "Analisa performance product X." to the performance agent', () => {
    const decision = route('Analisa performance product X.', 'ANALYZE');

    expect(decision.agent.id).toBe('agent.performance');
    expect(decision.fallback).toBe(false);
    expect(decision.intent).toBe('ANALYZE');
    expect(decision.toolPlan).toEqual(
      expect.arrayContaining(['enterprise.data', 'knowledge.search', 'analytics.query']),
    );
    expect(decision.rationale).toContain('Performance Agent');
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  it('prefers performance over product even though both match a keyword', () => {
    const decision = route('Analisa performance product X.', 'ANALYZE');
    const runnerUp = decision.alternatives[0];

    expect(decision.agent.id).toBe('agent.performance');
    expect(runnerUp?.agentId).toBe('agent.product');
    expect(runnerUp?.matched).toContain('product');
  });
});

describe('agent routing — selection by domain', () => {
  const cases: Array<[string, Intent, string]> = [
    ['Cari kebijakan tata kelola penggunaan AI di DPS', 'SEARCH', 'agent.knowledge'],
    ['Bandingkan pendekatan integrasi billing dengan benchmark industri', 'ANALYZE', 'agent.research'],
    ['Apa ruang lingkup rilis PRD Portal TANIA v1?', 'SEARCH', 'agent.product'],
    ['Susun rancangan solusi integrasi untuk pelanggan enterprise', 'CREATE', 'agent.solution'],
    ['Bagaimana posisi kompetitor kita di pasar konektivitas?', 'ANALYZE', 'agent.market-intelligence'],
    ['Hitung ROI dan titik impas investasi marketplace', 'ANALYZE', 'agent.business-case'],
    ['Buatkan draf notulen rapat portfolio review', 'CREATE', 'agent.documentation'],
    ['Bagaimana tren cycle time delivery kuartal ini?', 'ANALYZE', 'agent.performance'],
  ];

  it.each(cases)('routes %s (%s) to %s', (message, intent, expected) => {
    expect(route(message, intent).agent.id).toBe(expected);
  });

  it('explains the choice with the vocabulary that matched', () => {
    const decision = route('Buatkan draf notulen rapat portfolio review', 'CREATE');

    expect(decision.rationale).toMatch(/kata kunci/);
    expect(decision.rationale).toContain('intent CREATE');
  });
});

describe('agent routing — fallback and guards', () => {
  it('falls back to the read-only knowledge agent when nothing matches', () => {
    const decision = route('Halo, apa kabar hari ini?', 'CONVERSE');

    expect(decision.fallback).toBe(true);
    expect(decision.agent.id).toBe('agent.knowledge');
    expect(decision.agent.riskLevel).toBe('INFORMATIONAL');
    expect(decision.confidence).toBeLessThan(0.5);
    expect(decision.rationale).toContain('hanya membaca dokumen');
  });

  it('narrows the tool plan to what the caller permits', () => {
    const decision = route('Analisa performance product X.', 'ANALYZE', ['knowledge.search']);

    expect(decision.toolPlan).toEqual(['knowledge.search']);
  });

  it('never plans a tool the agent did not declare', () => {
    const decision = route('Hitung ROI dan titik impas investasi marketplace', 'ANALYZE', [
      'knowledge.search',
      'analytics.query',
      'document.draft',
      'system.broadcast',
    ]);

    expect(decision.toolPlan).not.toContain('system.broadcast');
    expect(decision.agent.requiredTools).not.toContain('system.broadcast');
  });

  it('is deterministic: the same request always routes the same way', () => {
    const first = route('Bagaimana tren cycle time delivery kuartal ini?', 'ANALYZE');
    const second = route('Bagaimana tren cycle time delivery kuartal ini?', 'ANALYZE');

    expect(second.agent.id).toBe(first.agent.id);
    expect(second.confidence).toBe(first.confidence);
  });

  it('ranks alternatives so a reviewer can see the runner-up', () => {
    const decision = route('Susun rancangan solusi integrasi untuk pelanggan enterprise', 'CREATE');

    expect(decision.alternatives.length).toBeGreaterThan(0);
    expect(decision.alternatives[0]?.score).toBeLessThanOrEqual(decision.confidence);
  });
});

describe('keyword matching', () => {
  it('matches whole words, not fragments', () => {
    expect(matchesKeyword('berapa sla layanan ini', 'sla')).toBe(true);
    expect(matchesKeyword('pekerjaan selesai tepat waktu', 'sla')).toBe(false);
  });

  it('matches multi-word phrases as substrings', () => {
    expect(matchesKeyword('susun business case untuk marketplace', 'business case')).toBe(true);
    expect(matchesKeyword('kasus bisnis lain', 'business case')).toBe(false);
  });

  it('ignores case and punctuation around the term', () => {
    expect(matchesKeyword('analisa performance product x.', 'performance')).toBe(true);
  });
});

describe('reaching the approval gate', () => {
  /**
   * The risk model is only real if some agent can actually carry L3 work.
   * Without this, the human approval gate would never fire outside tests.
   */
  it('routes an automation request to the only agent allowed to run workflows', () => {
    const stack = createAgentStack();
    const decision = stack.router.route({
      message: 'Jalankan workflow onboarding partner baru.',
      intent: 'AUTOMATE',
      actor: DEMO_ACTOR,
    });

    expect(decision.agent.id).toBe('agent.automation');
    expect(decision.agent.riskLevel).toBe('HIGH');
    expect(decision.agent.requiredTools).toContain('workflow.execute');
    expect(decision.fallback).toBe(false);
  });

  it('is the only agent that declares a high-risk tool', () => {
    const owners = createAgentStack()
      .registry.forTool('workflow.execute')
      .map((agent) => agent.id);

    expect(owners).toEqual(['agent.automation']);
  });
});
