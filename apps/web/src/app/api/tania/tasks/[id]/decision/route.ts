import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import {
  getIdentityProvider,
  getOrchestrator,
  recordTaskGovernance,
} from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

const MAX_REASON_LENGTH = 500;

/**
 * Moves a parked task forward, or stops it.
 *
 * `resume` re-reads each approval from the durable store before continuing, so
 * this endpoint cannot be used to run an action nobody actually approved.
 * `cancel` compensates whatever reversible work already happened.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    await guardRequest(request, { bucket: 'tania.tasks', subject: actor.id });

    const payload = await readJsonBody(request);

    const body = payload as { decision?: unknown; reason?: unknown };
    if (body.decision !== 'resume' && body.decision !== 'cancel') {
      throw ApiError.badRequest('`decision` must be either "resume" or "cancel".');
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
      throw ApiError.badRequest('`reason` must be a string when provided.');
    }
    if (typeof body.reason === 'string' && body.reason.length > MAX_REASON_LENGTH) {
      throw ApiError.badRequest(`\`reason\` must be at most ${MAX_REASON_LENGTH} characters.`);
    }

    const { id } = await params;
    const orchestrator = getOrchestrator();

    const report =
      body.decision === 'resume'
        ? await orchestrator.resume(id, actor, requestId)
        : await orchestrator.cancel(id, actor, body.reason ?? 'Dibatalkan oleh pengguna.');

    await recordTaskGovernance(report, requestId, actor);

    return ok(report, requestId, { status: report.status, riskCode: report.riskCode });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
