import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/ready/route';

/**
 * What readiness actually tells an operator.
 *
 * The response carries two kinds of finding, and the split is deliberate.
 * `checks` decide whether this instance takes traffic. `advisories` are things
 * worth seeing that must **not** remove it from rotation — a per-instance rate
 * limiter is a genuine misconfiguration above one replica, but failing
 * readiness on it would pull every instance out at once and cause the very
 * outage the limiter exists to prevent.
 */

type ReadyBody = {
  data: {
    ready: boolean;
    checks: { name: string; ok: boolean; detail: string }[];
    advisories: { name: string; ok: boolean; detail: string }[];
  };
};

async function read(): Promise<{ status: number; body: ReadyBody }> {
  const response = await GET(new Request('https://tania.test/api/ready'));
  return { status: response.status, body: (await response.json()) as ReadyBody };
}

describe('GET /api/ready', () => {
  it('reports whether the rate limiter holds across instances', async () => {
    const { body } = await read();

    const advisory = body.data.advisories.find((item) => item.name === 'rate_limit.distributed');
    expect(advisory).toBeDefined();
    expect(typeof advisory?.ok).toBe('boolean');
  });

  it('reports whether the limiter is currently degraded', async () => {
    const { body } = await read();

    expect(body.data.advisories.map((item) => item.name)).toContain('rate_limit.healthy');
  });

  it('says why when limits are only per-instance', async () => {
    // Without REDIS_URL in the test environment this is the state, and the
    // detail has to name the cause — an operator should not have to guess
    // which knob turns it on.
    const { body } = await read();

    const advisory = body.data.advisories.find((item) => item.name === 'rate_limit.distributed');
    if (advisory?.ok === false) {
      expect(advisory.detail).toContain('REDIS_URL');
    }
  });

  it('does not let a limiter advisory decide readiness', async () => {
    // The regression this guards: promoting an advisory into `checks` would
    // make every replica report itself unfit the moment Redis hiccuped.
    const { body } = await read();

    expect(body.data.checks.map((check) => check.name)).not.toContain('rate_limit.distributed');
    expect(body.data.checks.map((check) => check.name)).not.toContain('rate_limit.healthy');
    expect(body.data.ready).toBe(body.data.checks.every((check) => check.ok));
  });

  it('still gates readiness on the checks that matter', async () => {
    const { body } = await read();

    expect(body.data.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(['auth.configured', 'backend', 'approvals.durable']),
    );
  });
});
