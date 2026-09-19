import { correlationFrom } from '@tania/config';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { isIntent } from '@tania/types';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { readJsonBody } from '@/lib/http/body';
import { getAgents, getIdentityProvider } from '@/lib/tania/container';
import { getIntentService } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * Explains routing without executing anything.
 *
 * Useful when reviewing why a request reached a particular specialist: it
 * returns the chosen agent, the reasoning, the runner-up candidates, and the
 * tools that agent may currently use for this actor.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    // Origin check then rate limit: a forged request must not be able
    // to exhaust a real user's budget.
    guardRequest(request, { bucket: 'tania.read', subject: actor.id });

    const payload = await readJsonBody(request);

    const body = payload as { message?: unknown; intent?: unknown };
    if (typeof body.message !== 'string' || body.message.trim().length === 0) {
      throw ApiError.badRequest('`message` is required and must be a non-empty string.');
    }

    const intent = isIntent(body.intent)
      ? body.intent
      : (await getIntentService().classify(body.message)).value;

    const decision = getAgents().router.route({ message: body.message, intent, actor });

    return ok(
      {
        intent,
        agent: {
          id: decision.agent.id,
          name: decision.agent.name,
          domain: decision.agent.domain,
          riskLevel: decision.agent.riskLevel,
          capabilities: decision.agent.capabilities.map((capability) => capability.id),
        },
        confidence: decision.confidence,
        rationale: decision.rationale,
        toolPlan: decision.toolPlan,
        alternatives: decision.alternatives,
        fallback: decision.fallback,
      },
      requestId,
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
