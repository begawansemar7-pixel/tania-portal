import { config } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { processSingleton } from '@/lib/tania/process-state';
import { InProcessRateLimiter } from './in-process';
import { RedisRateLimiter, type RedisEval } from './redis';
import { ResilientRateLimiter, type LimiterState } from './resilient';
import type { RateLimiter } from './types';

export { InProcessRateLimiter } from './in-process';
export { RedisRateLimiter } from './redis';
export { ResilientRateLimiter, type LimiterState } from './resilient';
export { RATE_LIMITS, type RateLimitDecision, type RateLimitRule, type RateLimiter } from './types';

/**
 * Builds the connection.
 *
 * The options are the result of measuring rather than assuming. The obvious
 * combination — `lazyConnect` with `enableOfflineQueue: false`, so a dead Redis
 * fails fast instead of queuing — rejects the **first** command with "Stream
 * isn't writeable" after about 4ms, before the connection it just triggered
 * has had any chance to finish. Against a perfectly healthy server that means
 * every cold start would log a degrade that never happened, and a signal that
 * cries wolf on every deploy is worse than no signal.
 *
 * So the connection is opened eagerly here and the offline queue is left on,
 * which lets commands issued during the brief startup window wait for it. The
 * reason that is safe — and the reason the queue was worth distrusting — is
 * `commandTimeout`: a queued command cannot wait longer than that, so an outage
 * costs one bounded wait rather than a request hanging until Redis returns.
 * Paired with the caller's cooldown, only one request per cooldown pays it.
 *
 * `connect()` is deliberately not awaited: this runs inside a synchronous
 * factory, and the queue plus timeout already cover the window it would block.
 */
function connect(url: string): RedisEval & { quit(): Promise<unknown> } {
  // Imported lazily so the client is absent from any bundle that never limits.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require('ioredis') as typeof import('ioredis');

  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: config.redis.timeoutMs,
    connectTimeout: config.redis.timeoutMs,
  });

  // An unhandled 'error' event on an ioredis client crashes the process. The
  // limiter already treats failure as a degrade, so this only needs to stop
  // the event from being fatal.
  client.on('error', (error: Error) => {
    logger.warn('redis.error', { reason: error.message });
  });

  client.connect().catch((error: unknown) => {
    // Not fatal: the limiter degrades and keeps retrying on its own schedule.
    logger.warn('redis.connect_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  });

  return client;
}

/**
 * The limiter this process uses.
 *
 * With `REDIS_URL` set: Redis, wrapped so an outage degrades to the
 * per-instance counter loudly rather than failing open or taking the site down.
 * Without it: the per-instance counter alone, which is right for one machine
 * and wrong for more — `/api/ready` says which one is in force.
 */
export function rateLimiter(): RateLimiter {
  return processSingleton('rate-limiter', () => {
    const url = config.redis.url;

    if (url === undefined) {
      logger.info('rate_limit.in_process', {
        reason: 'REDIS_URL is not set',
        effect: 'Limits hold within this instance only.',
      });
      return new InProcessRateLimiter();
    }

    logger.info('rate_limit.distributed', { backend: 'redis' });
    return new ResilientRateLimiter(new RedisRateLimiter(connect(url)));
  });
}

/** What `/api/metrics` and `/api/ready` report about the limiter. */
export function limiterHealth(): {
  id: string;
  distributed: boolean;
  degraded: boolean;
  failures: number;
  buckets: number;
} {
  const limiter = rateLimiter();

  // Duck-typed rather than `instanceof`. The limiter is anchored on
  // `globalThis` so every bundle shares one counter, but those bundles do not
  // necessarily share one copy of the class — and a failed `instanceof` here
  // would report a degraded limiter as healthy, which is precisely the silent
  // blindness this module was written to remove.
  const state = hasState(limiter)
    ? limiter.state()
    : { degraded: false, failures: 0, degradedSince: null };

  return {
    id: limiter.id,
    distributed: limiter.distributed,
    degraded: state.degraded,
    failures: state.failures,
    buckets: hasSize(limiter) ? limiter.size() : 0,
  };
}

function hasState(value: RateLimiter): value is RateLimiter & { state(): LimiterState } {
  return typeof (value as { state?: unknown }).state === 'function';
}

function hasSize(value: RateLimiter): value is RateLimiter & { size(): number } {
  return typeof (value as { size?: unknown }).size === 'function';
}
