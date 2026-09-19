import { correlationFrom } from '@tania/config';
import { ok, toErrorResponse } from '@/lib/http/api-error';
import { guardRequest } from '@/lib/governance/policies/request-guard';
import { SESSION_COOKIE, cookieOptions } from '@/lib/identity/session';
import { isSecure, serializeCookie } from '../login/route';

export const dynamic = 'force-dynamic';

/**
 * Ends the session.
 *
 * A POST, and guarded like any other mutating route: sign-out over GET can be
 * triggered by an image tag on another site, which is a nuisance rather than a
 * breach but a trivially avoidable one.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    guardRequest(request, { bucket: 'tania.read', subject: 'logout' });

    const response = ok({ signedOut: true }, requestId);
    const headers = new Headers(response.headers);
    headers.append(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE, '', cookieOptions(0, isSecure(request))),
    );

    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
