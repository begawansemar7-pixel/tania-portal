import type { RateLimitDecision, RateLimitRule, RateLimiter } from './types';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * A fixed-window limiter held in process memory.
 *
 * Honest about its limit: with more than one instance each gets its own
 * counter, so the effective limit multiplies by the instance count. That is
 * acceptable as a safety net against a runaway client and **not** acceptable
 * as a control against a determined one.
 *
 * It remains in the codebase for two reasons that are not "we never finished":
 * it is what a single-instance development machine should use rather than
 * requiring Redis to run the app, and it is what the distributed limiter falls
 * back to when Redis is unreachable — a weaker limit being much better than
 * none, provided the degradation is visible. See `resilient.ts`.
 */
export class InProcessRateLimiter implements RateLimiter {
  readonly id = 'in-process';
  readonly distributed = false;

  private readonly buckets = new Map<string, Bucket>();

  /**
   * When the expired buckets were last dropped.
   *
   * `sweep()` existed and was documented as keeping the map bounded, but the
   * only caller was a test — so in a running process nothing was ever evicted
   * and the map grew by one permanent entry per distinct subject, forever.
   */
  private lastSweepAt = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  async check(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    return this.checkSync(key, rule);
  }

  /**
   * The same decision without the promise.
   *
   * Kept because the resilient limiter calls it on the failure path, where
   * wrapping a synchronous map lookup in a promise only to immediately await
   * it adds a turn of the event loop to every request during an outage.
   */
  checkSync(key: string, rule: RateLimitRule): RateLimitDecision {
    const at = this.now();
    this.sweepIfDue(at, rule.windowMs);
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= at) {
      this.buckets.set(key, { count: 1, resetAt: at + rule.windowMs });
      return {
        allowed: true,
        remaining: rule.limit - 1,
        retryAfter: 0,
        limit: rule.limit,
        enforcedBy: 'in-process',
      };
    }

    bucket.count += 1;
    const remaining = Math.max(0, rule.limit - bucket.count);

    return {
      allowed: bucket.count <= rule.limit,
      remaining,
      retryAfter: Math.ceil((bucket.resetAt - at) / 1000),
      limit: rule.limit,
      enforcedBy: 'in-process',
    };
  }

  /**
   * Amortised eviction, at most once per window.
   *
   * Sweeping on every call would make each request O(subjects); sweeping never
   * leaks. Once per window keeps the map proportional to *active* subjects
   * while adding a full scan only about as often as a bucket can expire.
   */
  private sweepIfDue(at: number, windowMs: number): void {
    if (at - this.lastSweepAt < windowMs) return;
    this.lastSweepAt = at;
    this.sweep();
  }

  /** Drops expired buckets so a long-lived process does not grow unbounded. */
  sweep(): void {
    const at = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= at) this.buckets.delete(key);
    }
  }

  size(): number {
    return this.buckets.size;
  }
}
