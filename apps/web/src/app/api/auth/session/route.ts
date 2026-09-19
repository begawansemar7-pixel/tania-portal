import { correlationFrom } from '@tania/config';
import { config } from '@/lib/config/env';
import { ok, toErrorResponse } from '@/lib/http/api-error';
import { getIdentityProvider } from '@/lib/tania/container';

export const dynamic = 'force-dynamic';

/**
 * Who the portal believes is asking.
 *
 * Returns `authenticated: false` rather than a 401: the sign-in screen needs to
 * ask this question before anyone is signed in, and an error status would make
 * that ordinary case look like a failure in the logs.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const actor = await getIdentityProvider().getActor(request);

    return ok(
      actor === null
        ? { authenticated: false as const, mode: config.auth.mode }
        : {
            authenticated: true as const,
            mode: config.auth.mode,
            actor: {
              name: actor.name,
              email: actor.email,
              unit: actor.unit,
              role: actor.role,
              clearance: actor.clearance,
              scopes: actor.scopes,
            },
          },
      requestId,
    );
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
