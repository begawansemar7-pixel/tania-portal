import { describe, expect, it } from 'vitest';
import type { GovernanceEvent, TaskReport } from '@tania/types';
import {
  METRIC_DEFINITIONS,
  MIN_SAMPLE,
  REQUIRED_GOVERNANCE_FIELDS,
  ROLE_SCOPES,
  TANIA_ROLES,
  isCompleteGovernanceEvent,
  scopesForRoles,
  separationOfDutyConflicts,
} from '@tania/types';
import {
  GovernanceRecorder,
  InMemoryGovernanceSink,
  TaskEvaluator,
  dataAccessOf,
  eventFromTask,
} from '@/lib/governance';
import { InProcessRateLimiter } from '@/lib/governance/policies/rate-limit';
import { assertSameOrigin, guardRequest } from '@/lib/governance/policies/request-guard';
import { applyRoles, resolveRoles } from '@/lib/governance/permissions/rbac';
import { DEMO_ACTOR } from '@/lib/identity/mock-identity';

function task(overrides: Partial<TaskReport> = {}): TaskReport {
  return {
    taskId: 'task-1',
    sessionId: 'conv-1',
    question: 'Analisa performance product X.',
    intent: 'ANALYZE',
    status: 'COMPLETED',
    plan: [],
    agents: ['agent.performance'],
    tools: [
      {
        toolId: 'knowledge.search',
        name: 'Knowledge Search',
        risk: 'INFORMATIONAL',
        status: 'SUCCEEDED',
        summary: 'ok',
      },
    ],
    evidence: [
      {
        id: 'doc-1',
        title: 'Delivery Health Report',
        source: 'DMO',
        snippet: 's',
        classification: 'CONFIDENTIAL',
        updatedAt: '2026-09-12',
        score: 0.9,
      },
    ],
    artifacts: [],
    verification: { ok: true, issues: [], checkedAt: '2026-09-19T00:00:00.000Z' },
    result: 'Tugas selesai.',
    errors: [],
    trace: [],
    risk: 'LOW',
    riskCode: 'L1',
    category: 'ANALYZE',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:02.000Z',
    ...overrides,
  } as TaskReport;
}

describe('the governance record', () => {
  it('carries the ten agreed fields', () => {
    const event = eventFromTask(task(), 'req-1', DEMO_ACTOR.id);

    expect(event.user).toBe(DEMO_ACTOR.id);
    expect(event.intent).toBe('ANALYZE');
    expect(event.agent).toBe('agent.performance');
    expect(event.tool).toBe('knowledge.search');
    expect(event.dataAccess.count).toBe(1);
    expect(event.action).toBe('RETRIEVE');
    expect(event.result).toBe('SUCCEEDED');
    expect(event.verification.ok).toBe(true);
    expect(event.timestamp).toBeTruthy();
    expect(event.correlationId).toBe('req-1');
  });

  it('records the highest classification it reached', () => {
    const access = dataAccessOf(
      task({
        evidence: [
          { ...task().evidence[0]!, id: 'a', classification: 'INTERNAL' },
          { ...task().evidence[0]!, id: 'b', classification: 'RESTRICTED' },
        ],
      }),
    );

    expect(access.classification).toBe('RESTRICTED');
    expect(access.resources).toEqual(['a', 'b']);
    // Retrieval always narrows by clearance, whether or not it withheld this time.
    expect(access.filtered).toBe(true);
  });

  it('names an execution as such', () => {
    const event = eventFromTask(
      task({
        tools: [
          {
            toolId: 'workflow.execute',
            name: 'Workflow',
            risk: 'HIGH',
            status: 'SUCCEEDED',
            summary: 'ok',
          },
        ],
      }),
      'req-1',
      DEMO_ACTOR.id,
    );

    expect(event.action).toBe('EXECUTE');
  });

  it('reports a parked task as awaiting a decision', () => {
    const event = eventFromTask(task({ status: 'APPROVAL' }), 'req-1', DEMO_ACTOR.id);

    expect(event.result).toBe('AWAITING_APPROVAL');
  });

  it('carries nothing that would leak reasoning', () => {
    const serialised = JSON.stringify(eventFromTask(task(), 'req-1', DEMO_ACTOR.id));

    for (const forbidden of ['prompt', 'reasoning', 'thought', 'completion']) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('the recorder', () => {
  it('refuses an incomplete record instead of storing it', async () => {
    const recorder = new GovernanceRecorder(new InMemoryGovernanceSink());
    const incomplete = { ...eventFromTask(task(), 'req-1', DEMO_ACTOR.id), correlationId: '' };

    // A trail that accepts half-filled rows looks complete and is not.
    await expect(recorder.record(incomplete as GovernanceEvent, DEMO_ACTOR)).rejects.toThrow(
      /tidak lengkap/,
    );
  });

  it('checks every field the contract demands', () => {
    const event = eventFromTask(task(), 'req-1', DEMO_ACTOR.id);

    for (const field of REQUIRED_GOVERNANCE_FIELDS) {
      const broken = { ...event, [field]: undefined };
      expect(isCompleteGovernanceEvent(broken), field).toBe(false);
    }

    expect(isCompleteGovernanceEvent(event)).toBe(true);
  });

  it('keeps one actor out of another actor trail', async () => {
    const recorder = new GovernanceRecorder(new InMemoryGovernanceSink());

    const a = { ...DEMO_ACTOR, id: 'usr_a' };
    const b = { ...DEMO_ACTOR, id: 'usr_b' };

    await recorder.record(eventFromTask(task(), 'req-1', a.id), a);
    await recorder.record(eventFromTask(task(), 'req-2', b.id), b);

    expect(await recorder.list(a)).toHaveLength(1);
  });

  it('says plainly that the memory sink is not durable', () => {
    expect(new GovernanceRecorder(new InMemoryGovernanceSink()).durable).toBe(false);
  });
});

describe('RBAC', () => {
  it('maps every role to at least one scope', () => {
    for (const role of TANIA_ROLES) {
      expect(ROLE_SCOPES[role].length, role).toBeGreaterThan(0);
    }
  });

  it('keeps running and approving apart', () => {
    // A role holding both would make the approval gate ceremonial.
    expect(ROLE_SCOPES.operator).toContain('workflow:run');
    expect(ROLE_SCOPES.operator).not.toContain('workflow:approve');
    expect(ROLE_SCOPES.approver).toContain('workflow:approve');
    expect(ROLE_SCOPES.approver).not.toContain('workflow:run');
  });

  it('combines the scopes of several roles', () => {
    expect(scopesForRoles(['analyst', 'approver'])).toEqual([
      'analytics:read',
      'knowledge:read',
      'workflow:approve',
    ]);
  });

  it('flags a combination that lets someone approve their own action', () => {
    expect(separationOfDutyConflicts(['operator', 'approver'])[0]).toContain('sendiri');
    expect(separationOfDutyConflicts(['analyst'])).toEqual([]);
  });

  it('reports an unmapped claim rather than dropping it silently', () => {
    const resolution = resolveRoles(['analyst', 'chief-vibes-officer']);

    expect(resolution.roles).toEqual(['analyst']);
    expect(resolution.unknown).toEqual(['chief-vibes-officer']);
  });

  it('replaces scopes rather than merging, so a demotion takes effect', () => {
    const demoted = applyRoles({ ...DEMO_ACTOR, scopes: ['system:admin'] }, ['viewer']);

    expect(demoted.scopes).toEqual(['knowledge:read']);
  });
});

describe('rate limiting', () => {
  function clock(start = 0) {
    let value = start;
    return { now: () => value, advance: (ms: number) => (value += ms) };
  }

  it('allows up to the limit and then refuses', () => {
    const time = clock();
    const limiter = new InProcessRateLimiter(time.now);
    const rule = { limit: 3, windowMs: 60_000 };

    expect(limiter.checkSync('a', rule).allowed).toBe(true);
    expect(limiter.checkSync('a', rule).allowed).toBe(true);
    expect(limiter.checkSync('a', rule).allowed).toBe(true);

    const refused = limiter.checkSync('a', rule);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfter).toBeGreaterThan(0);
  });

  it('gives each caller its own budget', () => {
    const limiter = new InProcessRateLimiter(clock().now);
    const rule = { limit: 1, windowMs: 60_000 };

    limiter.checkSync('a', rule);
    expect(limiter.checkSync('b', rule).allowed).toBe(true);
  });

  it('starts a new window once the old one passes', () => {
    const time = clock();
    const limiter = new InProcessRateLimiter(time.now);
    const rule = { limit: 1, windowMs: 1000 };

    limiter.checkSync('a', rule);
    expect(limiter.checkSync('a', rule).allowed).toBe(false);

    time.advance(1001);
    expect(limiter.checkSync('a', rule).allowed).toBe(true);
  });

  it('drops expired buckets so a long-lived process does not grow', () => {
    const time = clock();
    const limiter = new InProcessRateLimiter(time.now);

    limiter.checkSync('a', { limit: 1, windowMs: 1000 });
    expect(limiter.size()).toBe(1);

    time.advance(2000);
    limiter.sweep();
    expect(limiter.size()).toBe(0);
  });

  /**
   * The bug this closes: `sweep()` was documented as bounding the map, but no
   * production code ever called it. These exercise `check()` alone — a fix that
   * only works when a test calls `sweep()` by hand is not a fix.
   */
  it('evicts expired subjects without anyone calling sweep', () => {
    const time = clock();
    const limiter = new InProcessRateLimiter(time.now);
    const rule = { limit: 5, windowMs: 1000 };

    for (let subject = 0; subject < 50; subject += 1) {
      limiter.checkSync(`subject-${subject}`, rule);
    }
    expect(limiter.size()).toBe(50);

    // Every one of those windows has passed; one live subject remains.
    time.advance(1001);
    limiter.checkSync('someone-new', rule);

    expect(limiter.size()).toBe(1);
  });

  it('keeps counting correctly across a sweep', () => {
    const time = clock();
    const limiter = new InProcessRateLimiter(time.now);
    const rule = { limit: 2, windowMs: 1000 };

    limiter.checkSync('a', rule);
    time.advance(1001);

    // The sweep fires here; it must not resurrect or corrupt a live budget.
    expect(limiter.checkSync('a', rule).allowed).toBe(true);
    expect(limiter.checkSync('a', rule).allowed).toBe(true);
    expect(limiter.checkSync('a', rule).allowed).toBe(false);
  });

  it('does not sweep on every call', () => {
    const time = clock();
    const limiter = new InProcessRateLimiter(time.now);
    const rule = { limit: 100, windowMs: 1000 };

    // Within one window the map holds every subject: eviction is amortised,
    // not per-request, so a busy process does not pay O(subjects) each time.
    for (let subject = 0; subject < 20; subject += 1) {
      time.advance(10);
      limiter.checkSync(`subject-${subject}`, rule);
    }

    expect(limiter.size()).toBe(20);
  });

  it('admits that it is not distributed', () => {
    // With several instances each gets its own counter; the notes say so.
    expect(new InProcessRateLimiter().distributed).toBe(false);
  });
});

describe('cross-site protection', () => {
  function post(headers: Record<string, string>) {
    return new Request('https://tania.test/api/tania/tasks', { method: 'POST', headers });
  }

  it('accepts a request from its own origin', () => {
    expect(() => assertSameOrigin(post({ origin: 'https://tania.test' }))).not.toThrow();
  });

  it('refuses a request from another site', () => {
    expect(() => assertSameOrigin(post({ origin: 'https://evil.test' }))).toThrow(/lintas situs/);
  });

  it('falls back to the referer when no origin is sent', () => {
    expect(() => assertSameOrigin(post({ referer: 'https://evil.test/page' }))).toThrow();
    expect(() => assertSameOrigin(post({ referer: 'https://tania.test/page' }))).not.toThrow();
  });

  it('lets a server-to-server client through', () => {
    // No Origin and no Referer is what a bearer-token client looks like, and
    // such a client is not what CSRF protects against.
    expect(() => assertSameOrigin(post({}))).not.toThrow();
  });

  /**
   * The deployment shapes the check used to fail on.
   *
   * Next derives `request.url` from the address the server is bound to, so
   * behind an ingress it is the internal one while the browser sends the public
   * origin. Deriving the site from what the request was addressed to is what
   * makes these pass; before that, every one of them was a 403 for a legitimate
   * user.
   */
  describe('behind a proxy', () => {
    function proxied(headers: Record<string, string>) {
      // What a container bound to 0.0.0.0 sees as its own URL.
      return new Request('http://0.0.0.0:3000/api/tania/chat', { method: 'POST', headers });
    }

    it('accepts the public origin an ingress forwards', () => {
      expect(() =>
        assertSameOrigin(
          proxied({
            origin: 'https://tania.telkom.example',
            'x-forwarded-host': 'tania.telkom.example',
            'x-forwarded-proto': 'https',
          }),
        ),
      ).not.toThrow();
    });

    it('accepts TLS terminated at the ingress without a proto header', () => {
      expect(() =>
        assertSameOrigin(
          proxied({
            origin: 'https://tania.telkom.example',
            'x-forwarded-host': 'tania.telkom.example',
          }),
        ),
      ).not.toThrow();
    });

    it('accepts a plain host header when there is no proxy', () => {
      expect(() =>
        assertSameOrigin(proxied({ origin: 'http://localhost:3000', host: 'localhost:3000' })),
      ).not.toThrow();
    });

    it('reads only the first entry of a forwarded chain', () => {
      expect(() =>
        assertSameOrigin(
          proxied({
            origin: 'https://tania.telkom.example',
            'x-forwarded-host': 'tania.telkom.example, internal.mesh',
            'x-forwarded-proto': 'https, http',
          }),
        ),
      ).not.toThrow();
    });

    it('still refuses another site when forwarded headers are present', () => {
      expect(() =>
        assertSameOrigin(
          proxied({
            origin: 'https://evil.test',
            'x-forwarded-host': 'tania.telkom.example',
            'x-forwarded-proto': 'https',
          }),
        ),
      ).toThrow(/lintas situs/);
    });

    it('does not let a forged host vouch for a different origin', () => {
      // Host and Origin must agree; claiming one while sending the other is
      // exactly the case this check exists to reject.
      expect(() =>
        assertSameOrigin(proxied({ origin: 'https://evil.test', host: 'evil.test.attacker' })),
      ).toThrow(/lintas situs/);
    });
  });

  it('leaves reads alone', async () => {
    const read = new Request('https://tania.test/api/tania/tasks', {
      method: 'GET',
      headers: { origin: 'https://evil.test' },
    });

    // The guard decides which methods are checked; the assertion itself is
    // method-agnostic. A cross-site read of a JSON endpoint is blocked by CORS
    // anyway, and requiring a token for reads would break plain navigation.
    await expect(
      guardRequest(read, { bucket: 'tania.read', subject: `read-${Math.random()}` }),
    ).resolves.toBeDefined();
  });

  it('still checks a write through the guard', async () => {
    // The guard became async when the limiter did, so the refusal arrives as a
    // rejection rather than a synchronous throw. Routes await it inside their
    // existing try/catch, so the handling is unchanged.
    await expect(
      guardRequest(post({ origin: 'https://evil.test' }), {
        bucket: 'tania.read',
        subject: `write-${Math.random()}`,
      }),
    ).rejects.toThrow(/lintas situs/);
  });
});

describe('AI evaluation', () => {
  const evaluator = new TaskEvaluator();

  function report(tasks: TaskReport[]) {
    return evaluator.evaluate({ tasks, events: [] }, new Date('2026-09-19T01:00:00.000Z'));
  }

  it('produces all eight metrics', () => {
    const result = report([task()]);

    expect(result.metrics.map((metric) => metric.metric).sort()).toEqual(
      Object.keys(METRIC_DEFINITIONS).sort(),
    );
  });

  it('says when there is too little data to judge', () => {
    expect(report([task()]).insufficientData).toBe(true);
    expect(report(Array.from({ length: MIN_SAMPLE }, () => task())).insufficientData).toBe(false);
  });

  it('never reports an unmeasured metric as perfect', () => {
    const result = report([]);
    const completion = result.metrics.find((metric) => metric.metric === 'taskCompletion');

    // Zero observations must not render as 100%.
    expect(completion?.sample).toBe(0);
    expect(completion?.value).toBe(0);
  });

  it('counts a completed task toward completion and against failure', () => {
    const tasks = [
      ...Array.from({ length: 4 }, () => task()),
      task({ status: 'FAILED', errors: [{ code: 'TOOL_FAILED', message: 'm', recoverable: true }] }),
    ];
    const result = report(tasks);

    expect(result.metrics.find((m) => m.metric === 'taskCompletion')?.value).toBeCloseTo(0.8);
    expect(result.metrics.find((m) => m.metric === 'failureRate')?.value).toBeCloseTo(0.2);
  });

  it('treats an honest "no sources" answer as grounded', () => {
    const honest = task({
      evidence: [],
      result: 'Tidak ada sumber yang relevan dan boleh diakses ditemukan.',
    });
    const result = report(Array.from({ length: MIN_SAMPLE }, () => honest));

    // Refusing to invent is the behaviour this metric should reward.
    expect(result.metrics.find((m) => m.metric === 'groundedness')?.value).toBe(1);
    expect(result.metrics.find((m) => m.metric === 'hallucinationRate')?.value).toBe(0);
  });

  it('counts an unsupported claim as a hallucination', () => {
    const unsupported = task({ evidence: [], result: 'Kinerja produk X sangat baik.' });
    const result = report(Array.from({ length: MIN_SAMPLE }, () => unsupported));

    expect(result.metrics.find((m) => m.metric === 'hallucinationRate')?.value).toBe(1);
    expect(result.failing).toContain('hallucinationRate');
  });

  it('counts a blocked tool call against tool selection', () => {
    const blocked = task({
      tools: [
        {
          toolId: 'analytics.query',
          name: 'Analytics',
          risk: 'LOW',
          status: 'BLOCKED',
          summary: 'kurang scope',
        },
      ],
    });
    const result = report(Array.from({ length: MIN_SAMPLE }, () => blocked));

    expect(result.metrics.find((m) => m.metric === 'toolSelection')?.value).toBe(0);
  });

  it('measures latency from the task record', () => {
    const result = report(Array.from({ length: MIN_SAMPLE }, () => task()));

    expect(result.metrics.find((m) => m.metric === 'latencyMs')?.value).toBe(2000);
  });

  it('does not call a thin sample a failure', () => {
    const bad = task({ evidence: [], result: 'Klaim tanpa dasar.' });

    // One bad task is not evidence of a quality problem.
    expect(report([bad]).failing).toEqual([]);
  });
});

describe('every mutating route is guarded', () => {
  /**
   * Read from the source tree rather than asserted by hand.
   *
   * Two routes were found unguarded during review precisely because the sweep
   * that added the guard worked from a hand-maintained list. A list is the
   * thing that goes stale; the file system is not.
   */
  it('leaves no POST, PUT, PATCH or DELETE handler without a guard', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    async function routes(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const found: string[] = [];

      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...(await routes(path)));
        else if (entry.name === 'route.ts') found.push(path);
      }

      return found;
    }

    const unguarded: string[] = [];

    for (const path of await routes('src/app/api')) {
      const source = await readFile(path, 'utf8');
      const mutates = /export async function (POST|PUT|PATCH|DELETE)/.test(source);
      if (mutates && !source.includes('guardRequest')) unguarded.push(path);
    }

    expect(unguarded).toEqual([]);
  });
});
