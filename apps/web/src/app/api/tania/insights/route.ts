import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { INSIGHT_KIND_LABELS } from '@tania/types';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { getIdentityProvider, getInsights } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * What TANIA noticed without being asked.
 *
 * Read-only on purpose: an insight carries a suggested prompt, never a queued
 * action. Following one up means running a task like any other, through intent,
 * policy and approval.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    await guardRequest(request, { bucket: 'tania.read', subject: actor.id });

    const insights = getInsights();
    await insights.scan({ actor, now: new Date() });

    const found = await insights.list(actor, { limit: 20 });

    return ok(
      found.map((insight) => ({ ...insight, kindLabel: INSIGHT_KIND_LABELS[insight.kind] })),
      requestId,
      {
        count: found.length,
        urgent: found.filter((insight) => insight.severity === 'URGENT').length,
      },
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

/** Dismisses an insight so it stops being surfaced. */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    await guardRequest(request, { bucket: 'tania.read', subject: actor.id });

    const payload = await readJsonBody(request);

    const body = payload as { insightId?: unknown };
    if (typeof body.insightId !== 'string' || body.insightId.length === 0) {
      throw ApiError.badRequest('`insightId` is required.');
    }

    const dismissed = await getInsights().dismiss(body.insightId, actor);
    if (!dismissed) {
      throw ApiError.notFound(`Insight ${body.insightId} tidak ditemukan.`);
    }

    return ok(dismissed, requestId);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
