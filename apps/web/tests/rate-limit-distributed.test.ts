import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisRateLimiter, type RedisEval } from '@/lib/governance/policies/rate-limit/redis';
import { ResilientRateLimiter } from '@/lib/governance/policies/rate-limit/resilient';
import type { RateLimitRule } from '@/lib/governance/policies/rate-limit/types';

/**
 * The limiter that has to hold across instances.
 *
 * Blocker B2 was not that the in-process limiter counted wrongly — it counted
 * correctly, for one process. It was that on more than one replica the control
 * silently stopped holding. So these tests care about two things the old one
 * could not offer: one counter shared by every instance, and a failure that
 * announces itself instead of quietly reverting.
 */

const RULE: RateLimitRule = { limit: 3, windowMs: 60_000 };

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * A Redis that actually counts.
 *
 * Interpreting the script would be testing a Lua interpreter; instead this
 * reproduces its contract — one shared counter per key, with a TTL — so two
 * limiter instances genuinely share state, which is the property under test.
 */
function fakeRedis(): RedisEval & { keys: Map<string, { count: number; expiresAt: number }>; now: number } {
  const state = {
    keys: new Map<string, { count: number; expiresAt: number }>(),
    now: 0,
    async eval(_script: string, _numKeys: number, ...args: (string | number)[]): Promise<unknown> {
      const key = String(args[0]);
      const windowMs = Number(args[1]);

      const existing = state.keys.get(key);
      if (!existing || existing.expiresAt <= state.now) {
        state.keys.set(key, { count: 1, expiresAt: state.now + windowMs });
        return [1, windowMs];
      }

      existing.count += 1;
      return [existing.count, existing.expiresAt - state.now];
    },
  };
  return state;
}

describe('RedisRateLimiter', () => {
  it('counts a subject across separate limiter instances', async () => {
    // The whole point of B2: two replicas, one budget.
    const redis = fakeRedis();
    const replicaA = new RedisRateLimiter(redis);
    const replicaB = new RedisRateLimiter(redis);

    expect((await replicaA.check('chat:usr-1', RULE)).allowed).toBe(true);
    expect((await replicaB.check('chat:usr-1', RULE)).allowed).toBe(true);
    expect((await replicaA.check('chat:usr-1', RULE)).allowed).toBe(true);

    // Fourth request against a limit of three, wherever it lands.
    expect((await replicaB.check('chat:usr-1', RULE)).allowed).toBe(false);
  });

  it('keeps separate subjects apart', async () => {
    const redis = fakeRedis();
    const limiter = new RedisRateLimiter(redis);
    const tight: RateLimitRule = { limit: 1, windowMs: 60_000 };

    await limiter.check('chat:usr-1', tight);

    expect((await limiter.check('chat:usr-2', tight)).allowed).toBe(true);
  });

  it('reports the remaining budget as it shrinks', async () => {
    const limiter = new RedisRateLimiter(fakeRedis());

    expect((await limiter.check('k', RULE)).remaining).toBe(2);
    expect((await limiter.check('k', RULE)).remaining).toBe(1);
    expect((await limiter.check('k', RULE)).remaining).toBe(0);
  });

  it('never tells a refused caller to retry immediately', async () => {
    // `Retry-After: 0` invites a retry that will also be refused, which is how
    // a polite client becomes an accidental flood.
    const limiter = new RedisRateLimiter(fakeRedis());
    for (let i = 0; i < RULE.limit; i += 1) await limiter.check('k', RULE);

    const refused = await limiter.check('k', RULE);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('sets the expiry in the same call that creates the counter', async () => {
    // A key that exists without a TTL rate-limits its subject forever. The
    // script must not leave that window open, so the first call has to carry
    // the window length.
    const calls: (string | number)[][] = [];
    const limiter = new RedisRateLimiter({
      async eval(_script, _numKeys, ...args) {
        calls.push(args);
        return [1, RULE.windowMs];
      },
    });

    await limiter.check('k', RULE);

    expect(calls[0]).toContain(RULE.windowMs);
  });

  it('namespaces its keys', async () => {
    // A shared Redis must not let another tenant's keys collide with ours.
    const calls: string[] = [];
    const limiter = new RedisRateLimiter({
      async eval(_script, _numKeys, ...args) {
        calls.push(String(args[0]));
        return [1, RULE.windowMs];
      },
    });

    await limiter.check('chat:usr-1', RULE);

    expect(calls[0]).toBe('tania:rl:chat:usr-1');
  });

  it('treats a malformed reply as a failure rather than guessing', async () => {
    // A NaN count would become a limit of `undefined` and allow everything.
    const limiter = new RedisRateLimiter({
      async eval() {
        return 'not-an-array';
      },
    });

    await expect(limiter.check('k', RULE)).rejects.toThrow(/reply/i);
  });
});

describe('ResilientRateLimiter', () => {
  const failing: RedisEval = {
    async eval() {
      throw new Error('ECONNREFUSED');
    },
  };

  function clock(start = 0) {
    let value = start;
    return { now: () => value, advance: (ms: number) => (value += ms) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses Redis while Redis works', async () => {
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(fakeRedis()));

    const decision = await limiter.check('k', RULE);

    expect(decision.enforcedBy).toBe('redis');
    expect(limiter.state().degraded).toBe(false);
  });

  it('keeps serving when Redis is unreachable', async () => {
    // Failing closed would turn a Redis blip into a total outage. A rate
    // limiter is a safety net, and a safety net must not take the building down.
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(failing));

    const decision = await limiter.check('k', RULE);

    expect(decision.allowed).toBe(true);
    expect(decision.enforcedBy).toBe('in-process');
  });

  it('still enforces a limit while degraded', async () => {
    // Falling back must not mean failing open: an attacker who can disrupt
    // Redis would otherwise earn an unlimited request rate.
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(failing));
    const tight: RateLimitRule = { limit: 2, windowMs: 60_000 };

    expect((await limiter.check('k', tight)).allowed).toBe(true);
    expect((await limiter.check('k', tight)).allowed).toBe(true);
    expect((await limiter.check('k', tight)).allowed).toBe(false);
  });

  it('says so when it degrades', async () => {
    // The whole defect being fixed was a control that stopped holding in
    // silence. Degrading without a word would reproduce it.
    const { logger } = await import('@/lib/logger');
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(failing));

    await limiter.check('k', RULE);

    expect(logger.error).toHaveBeenCalledWith('rate_limit.degraded', expect.anything());
    expect(limiter.state().degraded).toBe(true);
    expect(limiter.state().failures).toBe(1);
  });

  it('logs the transition, not every request', async () => {
    // An outage would otherwise write one line per request and bury the event
    // that matters under its own noise.
    const { logger } = await import('@/lib/logger');
    const time = clock();
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(failing), {
      now: time.now,
      cooldownMs: 0,
    });

    for (let i = 0; i < 5; i += 1) await limiter.check('k', RULE);

    expect(vi.mocked(logger.error).mock.calls.filter((c) => c[0] === 'rate_limit.degraded')).toHaveLength(1);
  });

  it('stops calling a failed Redis until the cooldown passes', async () => {
    // Otherwise every request pays the connection timeout and a degraded
    // limiter becomes a slow site.
    const time = clock();
    let attempts = 0;
    const counting: RedisEval = {
      async eval() {
        attempts += 1;
        throw new Error('ECONNREFUSED');
      },
    };
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(counting), {
      now: time.now,
      cooldownMs: 5_000,
    });

    await limiter.check('k', RULE);
    await limiter.check('k', RULE);
    await limiter.check('k', RULE);
    expect(attempts).toBe(1);

    time.advance(5_001);
    await limiter.check('k', RULE);
    expect(attempts).toBe(2);
  });

  it('returns to Redis once it recovers', async () => {
    const { logger } = await import('@/lib/logger');
    const time = clock();
    const redis = fakeRedis();
    let broken = true;

    const flaky: RedisEval = {
      async eval(script, numKeys, ...args) {
        if (broken) throw new Error('ECONNREFUSED');
        return redis.eval(script, numKeys, ...args);
      },
    };

    const limiter = new ResilientRateLimiter(new RedisRateLimiter(flaky), {
      now: time.now,
      cooldownMs: 1_000,
    });

    await limiter.check('k', RULE);
    expect(limiter.state().degraded).toBe(true);

    broken = false;
    time.advance(1_001);
    const decision = await limiter.check('k', RULE);

    expect(decision.enforcedBy).toBe('redis');
    expect(limiter.state().degraded).toBe(false);
    expect(logger.info).toHaveBeenCalledWith('rate_limit.recovered', expect.anything());
  });

  it('counts every failure even when it only logs the first', async () => {
    const time = clock();
    const limiter = new ResilientRateLimiter(new RedisRateLimiter(failing), {
      now: time.now,
      cooldownMs: 0,
    });

    await limiter.check('k', RULE);
    await limiter.check('k', RULE);

    expect(limiter.state().failures).toBe(2);
  });
});
