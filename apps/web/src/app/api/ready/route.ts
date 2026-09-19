import { correlationFrom } from '@tania/config';
import { getPersistenceStatus } from '@/lib/tania/container';

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

  const ready = checks.every((check) => check.ok);

  return Response.json(
    { data: { ready, checks }, requestId },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
