import { logger } from '@/lib/logger';
import { InProcessRateLimiter } from './in-process';
import type { RateLimitDecision, RateLimitRule, RateLimiter } from './types';

export interface ResilientOptions {
  /**
   * How long to stop calling Redis after it fails.
   *
   * Without this, an outage makes every request pay the connection timeout
   * before falling back, turning a degraded limiter into a slow site. With it,
   * one request pays and the rest are served from memory until the cooldown
   * expires.
   */
  cooldownMs?: number;
  now?: () => number;
}

export interface LimiterState {
  degraded: boolean;
  /** Failures since the process started, for metrics. */
  failures: number;
  degradedSince: number | null;
}

/**
 * A distributed limiter that survives its own backend going away.
 *
 * The choice here is a security decision, so it is worth stating rather than
 * burying. When Redis is unreachable there are three options:
 *
 * - **Fail open** — allow everything. An attacker who can disrupt Redis gets an
 *   unlimited request rate, so the control becomes a liability exactly when the
 *   system is already unwell.
 * - **Fail closed** — refuse everything. A brief Redis blip becomes a total
 *   outage. Rate limiting is a safety net, not an authorisation check, and a
 *   safety net must not be able to take the building down.
 * - **Degrade** — fall back to the per-instance counter. The limit becomes
 *   `limit × replicas` instead of `limit`: weaker, bounded, and still a limit.
 *
 * Degrading wins, but only on one condition. The defect this replaces
 * (blocker B2) was not that the in-process limiter was weak — it was that it
 * stopped holding **without saying so**. So degradation here is loud: logged on
 * every transition, counted, exposed through `state()` for `/api/metrics`, and
 * carried on each decision as `enforcedBy`. A degraded control that nobody can
 * see is the bug, not the fallback.
 */
export class ResilientRateLimiter implements RateLimiter {
  readonly id = 'resilient';
  readonly distributed = true;

  private readonly fallback: InProcessRateLimiter;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  private failures = 0;
  private degradedSince: number | null = null;
  private retryRedisAt = 0;

  constructor(
    private readonly primary: RateLimiter,
    options: ResilientOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.cooldownMs = options.cooldownMs ?? 5_000;
    this.fallback = new InProcessRateLimiter(this.now);
  }

  async check(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const at = this.now();

    // Still cooling down from a failure: do not pay the timeout again.
    if (this.degradedSince !== null && at < this.retryRedisAt) {
      return this.fallback.checkSync(key, rule);
    }

    try {
      const decision = await this.primary.check(key, rule);
      this.recover();
      return decision;
    } catch (error) {
      this.degrade(error, at);
      return this.fallback.checkSync(key, rule);
    }
  }

  state(): LimiterState {
    return {
      degraded: this.degradedSince !== null,
      failures: this.failures,
      degradedSince: this.degradedSince,
    };
  }

  private degrade(error: unknown, at: number): void {
    this.failures += 1;
    this.retryRedisAt = at + this.cooldownMs;

    // Log the transition, not every request: an outage would otherwise write a
    // line per request and bury the event that matters under its own noise.
    if (this.degradedSince === null) {
      this.degradedSince = at;
      logger.error('rate_limit.degraded', {
        audit: true,
        reason: error instanceof Error ? error.message : 'unknown',
        effect: 'Limits are now per-instance and no longer hold across replicas.',
      });
    }
  }

  private recover(): void {
    if (this.degradedSince === null) return;

    logger.info('rate_limit.recovered', {
      audit: true,
      degradedForMs: this.now() - this.degradedSince,
    });
    this.degradedSince = null;
  }
}
