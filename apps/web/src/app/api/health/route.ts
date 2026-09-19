import { buildHealthReport, correlationFrom, type HealthProbe } from '@tania/config';
import type { ApiSuccess, HealthReport } from '@tania/types';
import { config } from '@/lib/config/env';
import { getPersistenceStatus } from '@/lib/tania/container';

const STARTED_AT = new Date();

/** Runtime state, never a build-time snapshot. */
export const dynamic = 'force-dynamic';

/** Liveness for the portal, including whether durable persistence is reachable. */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);
  const persistence = getPersistenceStatus();

  const probes: HealthProbe[] = [
    {
      name: 'backend',
      timeoutMs: config.api.timeoutMs,
      check: async () => {
        if (!config.api.baseUrl) {
          return {
            state: 'degraded' as const,
            detail: 'TANIA_API_BASE_URL is not set; approvals are in-memory only.',
          };
        }

        const response = await fetch(new URL('health', `${config.api.baseUrl}/`), {
          cache: 'no-store',
        });
        return response.ok
          ? { state: 'ok' as const }
          : { state: 'down' as const, detail: `backend responded ${response.status}` };
      },
    },
  ];

  const report = await buildHealthReport({
    service: config.service,
    version: config.version,
    environment: config.environment,
    startedAt: STARTED_AT,
    probes,
  });

  const body: ApiSuccess<HealthReport> = {
    data: report,
    requestId,
    meta: {
      approvalsDurable: persistence.approvalsDurable,
      transcriptDurable: persistence.transcriptDurable,
    },
  };

  return Response.json(body, { status: report.state === 'down' ? 503 : 200 });
}
