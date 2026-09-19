import { correlationFrom } from '@tania/config';
import { config } from '@/lib/config/env';
import { ApiError, toErrorResponse } from '@/lib/http/api-error';
import { logger } from '@/lib/logger';
import { actorFromClaims, exchangeCode, statesMatch, verifyIdToken } from '@/lib/identity/oidc';
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, cookieOptions, sealSession } from '@/lib/identity/session';
import { parseCookie } from '@/lib/identity/oidc-identity';
import { safeReturnTo } from '@/lib/identity/return-to';
import { isSecure, serializeCookie } from '../login/route';

export const dynamic = 'force-dynamic';

interface ParkedState {
  state?: string;
  nonce?: string;
  codeVerifier?: string;
  returnTo?: string;
}

/**
 * Completes sign-in.
 *
 * Everything the IdP sends back is checked against what this browser parked
 * before it left: the state, and then the nonce inside the verified token. A
 * callback that cannot be matched to a login attempt is refused rather than
 * treated as a new one.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = correlationFrom(request.headers);

  try {
    const oidc = config.auth.oidc;
    if (!oidc) {
      throw ApiError.notImplemented('This deployment does not use OIDC sign-in.');
    }

    const url = new URL(request.url);

    // The IdP reports a refusal here; surfacing it as a failed sign-in rather
    // than a crash keeps the message something a person can act on.
    const idpError = url.searchParams.get('error');
    if (idpError !== null) {
      logger.warn('auth.idp_refused', { requestId, error: idpError });
      throw ApiError.unauthorized('Sign-in was refused by the identity provider.');
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code === null || state === null) {
      throw ApiError.badRequest('Callback is missing `code` or `state`.');
    }

    const parked = readParkedState(request);
    if (!parked.state || !parked.nonce || !parked.codeVerifier) {
      throw ApiError.unauthorized('No sign-in is in progress for this browser.');
    }

    if (!statesMatch(state, parked.state)) {
      logger.warn('auth.state_mismatch', { requestId });
      throw ApiError.unauthorized('Sign-in could not be verified.');
    }

    const { idToken } = await exchangeCode(oidc, code, parked.codeVerifier);
    const claims = await verifyIdToken(oidc, idToken, parked.nonce);
    const actor = actorFromClaims(claims, oidc);

    const session = await sealSession(
      actor,
      config.auth.session.secret,
      config.auth.session.ttlSeconds,
    );

    logger.info('auth.signed_in', {
      requestId,
      subject: actor.subject,
      scopes: actor.scopes.length,
      clearance: actor.clearance,
    });

    const secure = isSecure(request);
    const headers = new Headers({ Location: safeReturnTo(parked.returnTo) });
    headers.append(
      'Set-Cookie',
      serializeCookie(
        SESSION_COOKIE,
        session,
        cookieOptions(config.auth.session.ttlSeconds, secure),
      ),
    );
    // The parked state is single use; leaving it would allow a replay.
    headers.append('Set-Cookie', serializeCookie(OAUTH_STATE_COOKIE, '', cookieOptions(0, secure)));

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}

function readParkedState(request: Request): ParkedState {
  const header = request.headers.get('cookie');
  if (header === null) return {};

  const raw = parseCookie(header, OAUTH_STATE_COOKIE);
  if (raw === undefined) return {};

  try {
    return JSON.parse(raw) as ParkedState;
  } catch {
    return {};
  }
}
