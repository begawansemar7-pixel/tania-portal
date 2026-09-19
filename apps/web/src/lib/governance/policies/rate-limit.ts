import { processSingleton } from '@/lib/tania/process-state';

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets, for `Retry-After`. */
  retryAfter: number;
  limit: number;
}

/**
 * Per-route limits.
 *
 * Tighter where the work is expensive or the surface is sensitive: starting a
 * task runs agents and tools, and deciding an approval changes enterprise
 * state. Reading is cheap and generous.
 */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  'tania.chat': { limit: 30, windowMs: 60_000 },
  'tania.tasks': { limit: 20, windowMs: 60_000 },
  'tania.voice': { limit: 60, windowMs: 60_000 },
  'tania.approvals': { limit: 30, windowMs: 60_000 },
  'tania.read': { limit: 120, windowMs: 60_000 },
};

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
 * as a control against a determined one — which is why the production notes
 * call for Redis before this is relied upon.
 */
export class InProcessRateLimiter {
  readonly id = 'in-process';
  readonly distributed = false;

  private readonly buckets = new Map<string, Bucket>();

  /**
   * When the expired buckets were last dropped.
   *
   * `sweep()` existed and was documented as keeping the map bounded, but the
   * only caller was a test — so in a running process nothing was ever evicted
   * and the map grew by one permanent entry per distinct subject, forever.
   * Invisible today because one mock actor makes one key; one entry per user
   * per bucket once real identity lands.
   */
  private lastSweepAt = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(key: string, rule: RateLimitRule): RateLimitDecision {
    const at = this.now();
    this.sweepIfDue(at, rule.windowMs);
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= at) {
      this.buckets.set(key, { count: 1, resetAt: at + rule.windowMs });
      return { allowed: true, remaining: rule.limit - 1, retryAfter: 0, limit: rule.limit };
    }

    bucket.count += 1;
    const remaining = Math.max(0, rule.limit - bucket.count);

    return {
      allowed: bucket.count <= rule.limit,
      remaining,
      retryAfter: Math.ceil((bucket.resetAt - at) / 1000),
      limit: rule.limit,
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

/** The limiter the portal shares, anchored so every bundle sees one counter. */
export function rateLimiter(): InProcessRateLimiter {
  return processSingleton('rate-limiter', () => new InProcessRateLimiter());
}
