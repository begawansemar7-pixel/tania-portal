import { correlationFrom } from '@tania/config';
import { getPersistenceStatus } from '@/lib/tania/container';
import { limiterHealth } from '@/lib/governance';
import { config } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

/**
 * Readiness: may this instance receive traffic?
 *
 * Distinct from liveness on purpose. Liveness answers "is the process wedged",
 * and a failing liveness check restarts the container. Readiness answers "can
 * this instance serve a request right now", and a failing one only takes it out
 * of rotation. Conflating them turns a slow dependency into a restart loop.
 *
 * A missing backend is reported as **not ready** rather than degraded: without
 * it, approvals fall back to memory, and an approval that cannot be recorded
 * durably must not gate a production action.
 *
 * The response separates two kinds of finding, because conflating them causes
 * outages. `checks` gate readiness. `advisories` are reported and do not: a
 * per-instance rate limiter is a real misconfiguration above one replica, but
 * failing readiness on it would pull **every** instance out of rotation and
 * cause the outage it was meant to prevent. Worth seeing, not worth refusing
 * traffic over.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);
  const status = getPersistenceStatus();

  const checks = [
    // First, because an instance that authenticates nobody must never take
    // traffic — and because the other checks passing would otherwise make it
    // look healthy.
    { name: 'auth.configured', ok: status.authSecure, detail: 'TANIA_AUTH_MODE' },
    { name: 'backend', ok: status.backendConfigured, detail: 'TANIA_API_BASE_URL' },
    { name: 'approvals.durable', ok: status.approvalsDurable, detail: 'PostgreSQL' },
    { name: 'governance.durable', ok: status.governanceDurable, detail: 'audit sink' },
  ];

  const limiter = limiterHealth();

  const advisories = [
    {
      name: 'auth.demo',
      ok: config.auth.demo !== true,
      detail:
        config.auth.demo === true
          ? 'TANIA_INSECURE_DEMO is on — every visitor is one actor holding every scope. Evaluation only.'
          : 'ok',
    },
    {
      name: 'rate_limit.distributed',
      ok: limiter.distributed,
      detail: limiter.distributed
        ? `enforced by ${limiter.id}`
        : 'REDIS_URL unset — limits hold within this instance only',
    },
    {
      name: 'rate_limit.healthy',
      ok: !limiter.degraded,
      detail: limiter.degraded
        ? `rate-limit backend unreachable after ${limiter.failures} failures; counting per-instance`
        : 'ok',
    },
  ];

  const ready = checks.every((check) => check.ok);

  return Response.json(
    { data: { ready, checks, advisories }, requestId },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
