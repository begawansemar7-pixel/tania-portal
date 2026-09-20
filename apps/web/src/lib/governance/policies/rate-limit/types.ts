/**
 * The rate-limiting contract.
 *
 * `check` is async because the only implementation that actually holds a limit
 * across instances has to talk to something over a socket. The in-process
 * limiter satisfies the same shape so callers cannot tell which one they have
 * — which is the point: choosing the limiter is a deployment decision, not a
 * decision each route makes.
 */

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
  /**
   * Which limiter actually decided this.
   *
   * Present so a degraded decision is visible rather than merely true-or-false.
   * The failure this whole module exists to fix was a control that stopped
   * holding without saying so.
   */
  enforcedBy: 'redis' | 'in-process';
}

export interface RateLimiter {
  readonly id: string;
  /** Whether this limiter holds a limit across instances. */
  readonly distributed: boolean;
  check(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
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
