import { correlationFrom } from '@tania/config';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { getGovernance, getIdentityProvider } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * The governance trail for the current actor.
 *
 * Requires `audit:read`, and returns only this actor's own records. Reading
 * everyone's trail is a separate, higher privilege that this endpoint
 * deliberately does not grant.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }
    guardRequest(request, { bucket: 'tania.read', subject: actor.id });

    if (!actor.scopes.includes('audit:read')) {
      throw new ApiError('FORBIDDEN', 'Actor lacks the audit:read scope.');
    }

    const governance = getGovernance();
    const events = await governance.list(actor, 100);

    return ok(events, requestId, {
      count: events.length,
      durable: governance.durable,
    });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
