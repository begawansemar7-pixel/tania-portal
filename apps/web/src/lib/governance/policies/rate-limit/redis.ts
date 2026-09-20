import type { RateLimitDecision, RateLimitRule, RateLimiter } from './types';

/**
 * The only Redis surface this limiter needs.
 *
 * Declared here rather than importing `ioredis` types throughout so the
 * counting logic can be tested against a fake without a server, and so
 * swapping the client later touches one adapter instead of the module.
 */
export interface RedisEval {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * Fixed-window counting, done in one atomic step.
 *
 * The obvious implementation — `INCR`, then `EXPIRE` if the count is 1 — has a
 * race that matters: between the two commands the key exists with no TTL. If
 * the process dies there, or the connection drops, that key never expires and
 * the subject is rate-limited **forever**. A user locked out permanently by an
 * infrastructure blip is a worse failure than the one the limiter prevents.
 *
 * A script runs atomically on the server, so the counter and its expiry are set
 * together or not at all.
 *
 * The `PTTL < 0` branch is not theoretical: it is what a key with no expiry
 * looks like, which is exactly the state an older buggy deployment could have
 * left behind. Re-arming the TTL means such a key heals on next contact rather
 * than staying poisoned.
 */
const SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

/** Namespaced so a shared Redis cannot collide with another tenant's keys. */
const PREFIX = 'tania:rl:';

export class RedisRateLimiter implements RateLimiter {
  readonly id = 'redis';
  readonly distributed = true;

  constructor(private readonly client: RedisEval) {}

  async check(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const raw = await this.client.eval(SCRIPT, 1, `${PREFIX}${key}`, rule.windowMs);
    const [count, ttlMs] = parseReply(raw);

    const remaining = Math.max(0, rule.limit - count);

    return {
      allowed: count <= rule.limit,
      remaining,
      // Round up: a `Retry-After: 0` invites an immediate retry that will also
      // be refused, which is how a polite client becomes an accidental flood.
      retryAfter: count <= rule.limit ? 0 : Math.max(1, Math.ceil(ttlMs / 1000)),
      limit: rule.limit,
      enforcedBy: 'redis',
    };
  }
}

/**
 * Reads the script's reply without trusting its shape.
 *
 * A Lua multi-bulk reply arrives as an array of numbers, but this crosses a
 * process boundary and a malformed reply must not silently become `NaN` and
 * then a limit of `undefined`. Throwing hands control to the caller's fallback,
 * which is the behaviour we want: treat a confused Redis as an unavailable one.
 */
function parseReply(raw: unknown): [count: number, ttlMs: number] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new TypeError('Unexpected reply from the rate-limit script.');
  }

  const count = Number(raw[0]);
  const ttlMs = Number(raw[1]);

  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new TypeError('Rate-limit script returned a non-numeric reply.');
  }

  return [count, ttlMs];
}
