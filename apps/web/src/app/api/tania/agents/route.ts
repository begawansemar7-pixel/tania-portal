import { correlationFrom } from '@tania/config';
import { ApiError, ok, toErrorResponse } from '@/lib/http/api-error';
import { getAgents, getIdentityProvider } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/** The registry, as declared: capabilities, allowed tools, and risk ceilings. */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);
    if (!actor) {
      throw ApiError.unauthorized('No authenticated actor for this request.');
    }

    const definitions = getAgents().registry.definitions();
    return ok(definitions, requestId, { agents: definitions.length });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
