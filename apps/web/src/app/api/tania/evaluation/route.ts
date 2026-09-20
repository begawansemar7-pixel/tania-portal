import { correlationFrom } from '@tania/config';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import {
  getEvaluator,
  getGovernanceSink,
  getIdentityProvider,
  getTaskStore,
} from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * AI quality, as eight numbers.
 *
 * Computed from the task trail, so the numbers describe what actually ran.
 * `insufficientData` is part of the response rather than hidden: a perfect
 * score over three tasks is not evidence of anything.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }
    await guardRequest(request, { bucket: 'tania.read', subject: actor.id });

    const tasks = await getTaskStore().list(actor, 200);
    const report = getEvaluator().evaluate({ tasks, events: await getGovernanceSink().all() });

    return ok(report, requestId, {
      failing: report.failing.length,
      insufficientData: report.insufficientData,
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
