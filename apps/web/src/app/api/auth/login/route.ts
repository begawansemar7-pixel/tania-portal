import { correlationFrom } from '@tania/config';
import { config } from '@/lib/config/env';
import { toErrorResponse, ApiError } from '@/lib/http/api-error';
import { buildAuthorizationRequest } from '@/lib/identity/oidc';
import { OAUTH_STATE_COOKIE, cookieOptions } from '@/lib/identity/session';
import { safeReturnTo } from '@/lib/identity/return-to';

export const dynamic = 'force-dynamic';

/**
 * Starts sign-in.
 *
 * The state, nonce and PKCE verifier are parked in one short-lived cookie
 * rather than in server memory: the callback may land on a different instance,
 * and a login that works only when the load balancer cooperates is a login that
 * fails intermittently.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const oidc = config.auth.oidc;
    if (!oidc) {
      throw ApiError.notImplemented('This deployment does not use OIDC sign-in.');
    }

    const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));
    const authorization = await buildAuthorizationRequest(oidc, returnTo);

    const parked = JSON.stringify({
      state: authorization.state,
      nonce: authorization.nonce,
      codeVerifier: authorization.codeVerifier,
      returnTo,
    });

    const response = Response.redirect(authorization.url, 302);
    const headers = new Headers(response.headers);
    headers.append(
      'Set-Cookie',
      serializeCookie(OAUTH_STATE_COOKIE, parked, cookieOptions(600, isSecure(request))),
    );

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

export function isSecure(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return proto === 'https' || new URL(request.url).protocol === 'https:';
}

export function serializeCookie(
  name: string,
  value: string,
  options: ReturnType<typeof cookieOptions>,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite === 'lax' ? 'Lax' : 'Strict'}`,
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}
