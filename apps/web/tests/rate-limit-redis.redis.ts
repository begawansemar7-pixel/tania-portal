import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { RedisRateLimiter } from '@/lib/governance/policies/rate-limit/redis';
import type { RateLimitRule } from '@/lib/governance/policies/rate-limit/types';

/**
 * The limiter against a real Redis.
 *
 * The unit tests use a fake that reproduces the script's contract, which proves
 * the limiter's logic but says nothing about the Lua itself — whether the
 * commands exist, whether the reply arrives in the shape the parser expects,
 * whether the expiry is really set. A fake agrees with whoever wrote it.
 *
 * Run by `npm run test:redis`, not by `npm run test`, and it **fails** rather
 * than skips when `REDIS_URL` is absent. A test that quietly skips its
 * prerequisite is worse than no test: the board goes green and the claim was
 * never checked. Keeping it out of the default run is what lets a developer
 * without Redis still have a meaningful green.
 */

const URL = process.env.REDIS_URL;
const RULE: RateLimitRule = { limit: 3, windowMs: 2_000 };

describe('RedisRateLimiter against a real server', () => {
  let client: Redis;
  let limiter: RedisRateLimiter;

  /** Unique per run so a re-run never inherits the previous run's counters. */
  const key = (name: string) => `it-${process.pid}-${Date.now()}-${name}`;

  beforeAll(async () => {
    if (!URL) {
      throw new Error(
        'REDIS_URL is required for this suite. Run `npm run test:redis` with Redis reachable, ' +
          'or run `npm test` for the suite that does not need one.',
      );
    }

    client = new Redis(URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await client.connect();
    limiter = new RedisRateLimiter(client);
  });

  afterAll(async () => {
    await client?.quit();
  });

  it('runs the script and counts', async () => {
    const k = key('count');

    expect((await limiter.check(k, RULE)).allowed).toBe(true);
    expect((await limiter.check(k, RULE)).allowed).toBe(true);
    expect((await limiter.check(k, RULE)).allowed).toBe(true);
    expect((await limiter.check(k, RULE)).allowed).toBe(false);
  });

  it('really sets an expiry on the counter', async () => {
    // The failure this guards against is a key with no TTL, which would
    // rate-limit its subject permanently.
    const k = key('ttl');
    await limiter.check(k, RULE);

    const ttl = await client.pttl(`tania:rl:${k}`);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(RULE.windowMs);
  });

  it('lets the budget return after the window', async () => {
    const k = key('window');
    for (let i = 0; i < RULE.limit; i += 1) await limiter.check(k, RULE);
    expect((await limiter.check(k, RULE)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, RULE.windowMs + 200));

    expect((await limiter.check(k, RULE)).allowed).toBe(true);
  });

  it('heals a key that somehow has no expiry', async () => {
    // Exactly what a crash between INCR and EXPIRE would have left behind in
    // the non-atomic implementation this replaces.
    const k = key('persist');
    await limiter.check(k, RULE);
    await client.persist(`tania:rl:${k}`);
    expect(await client.pttl(`tania:rl:${k}`)).toBe(-1);

    await limiter.check(k, RULE);

    expect(await client.pttl(`tania:rl:${k}`)).toBeGreaterThan(0);
  });

  it('shares one budget between two limiter instances', async () => {
    // Two limiters over one server stands in for two replicas — the property
    // blocker B2 was about.
    const k = key('shared');
    const replicaA = new RedisRateLimiter(client);
    const replicaB = new RedisRateLimiter(client);
    const tight: RateLimitRule = { limit: 2, windowMs: 5_000 };

    expect((await replicaA.check(k, tight)).allowed).toBe(true);
    expect((await replicaB.check(k, tight)).allowed).toBe(true);
    expect((await replicaA.check(k, tight)).allowed).toBe(false);
  });

  it('counts concurrent requests exactly once each', async () => {
    // The reason the counting lives in a script at all: twenty simultaneous
    // requests must consume twenty units, not fewer through a lost update.
    const k = key('concurrent');
    const wide: RateLimitRule = { limit: 100, windowMs: 5_000 };

    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.check(k, wide)),
    );

    const remaining = decisions.map((decision) => decision.remaining).sort((a, b) => a - b);
    expect(remaining).toEqual(Array.from({ length: 20 }, (_, i) => 80 + i));
  });
});
