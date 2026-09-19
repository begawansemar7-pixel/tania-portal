import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { TaniaError } from '@tania/config';
import type { OidcPortalConfig } from '@/lib/config/env';
import { resolveRoles } from '@/lib/governance/permissions/rbac';
import { scopesForRoles } from '@tania/types';
import { logger } from '@/lib/logger';
import type { SessionActor } from './session';

/**
 * The browser-facing half of OIDC.
 *
 * `apps/api` already verifies a bearer token it is handed; what was missing is
 * the flow that obtains one — authorization code with PKCE, then a session
 * cookie. Nothing here hardcodes a tenant or endpoint: everything is read from
 * the issuer's discovery document.
 */

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

/** Discovery is stable for the life of a process and costs a round trip. */
let discovered: { issuer: string; document: Discovery } | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function discover(config: OidcPortalConfig): Promise<Discovery> {
  if (discovered?.issuer === config.issuer) return discovered.document;

  const base = config.issuer.endsWith('/') ? config.issuer : `${config.issuer}/`;
  const url = new URL('.well-known/openid-configuration', base);

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw TaniaError.upstreamUnavailable(
      `OIDC discovery failed with status ${response.status}.`,
    );
  }

  const document = (await response.json()) as Partial<Discovery>;
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof document[field] !== 'string') {
      throw TaniaError.upstreamUnavailable(`OIDC discovery document has no ${field}.`);
    }
  }

  const full = { ...document, issuer: document.issuer ?? config.issuer } as Discovery;
  discovered = { issuer: config.issuer, document: full };
  return full;
}

export interface AuthorizationRequest {
  url: string;
  /** Held in a short-lived cookie and checked when the IdP redirects back. */
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function buildAuthorizationRequest(
  config: OidcPortalConfig,
  returnTo: string,
): Promise<AuthorizationRequest> {
  const document = await discover(config);

  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  // PKCE, even though the portal is a confidential client: it costs nothing and
  // removes the value of an intercepted code outright.
  const codeVerifier = randomBytes(64).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  const url = new URL(document.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  logger.info('auth.authorization_requested', { returnTo });

  return { url: url.toString(), state, nonce, codeVerifier };
}

/** Constant-time comparison, so a mismatch leaks nothing about the real value. */
export function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function exchangeCode(
  config: OidcPortalConfig,
  code: string,
  codeVerifier: string,
): Promise<{ idToken: string }> {
  const document = await discover(config);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch(document.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    // The IdP's error body can name the client secret's state; it belongs in
    // the log, not in anything the browser will render.
    logger.error('auth.token_exchange_failed', { status: response.status });
    throw TaniaError.unauthorized('Sign-in could not be completed.');
  }

  const payload = (await response.json()) as { id_token?: string };
  if (typeof payload.id_token !== 'string') {
    throw TaniaError.unauthorized('Sign-in could not be completed.');
  }

  return { idToken: payload.id_token };
}

export async function verifyIdToken(
  config: OidcPortalConfig,
  idToken: string,
  nonce: string,
): Promise<JWTPayload> {
  const document = await discover(config);
  jwks ??= createRemoteJWKSet(new URL(document.jwks_uri));

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: document.issuer,
    audience: config.clientId,
  });

  // Binds this token to this browser's sign-in attempt; without it a token
  // obtained elsewhere could be replayed into someone else's callback.
  if (payload.nonce !== nonce) {
    throw TaniaError.unauthorized('Sign-in could not be completed.');
  }

  return payload;
}

/**
 * Turns verified claims into an actor.
 *
 * Scopes come from the IdP's group or role claim mapped through the RBAC table
 * — never from a scope claim the token carries directly. That matters: a
 * directory administrator grants *groups*, and letting a token name portal
 * scopes would move authorisation out of this codebase and into whoever can
 * edit a claim.
 */
export function actorFromClaims(payload: JWTPayload, config: OidcPortalConfig): SessionActor {
  const claims = payload as JWTPayload & Record<string, unknown>;

  const subject = claims.sub;
  if (typeof subject !== 'string' || subject.length === 0) {
    throw TaniaError.unauthorized('Token has no subject.');
  }

  const rawRoles = claims[config.rolesClaim];
  const claimed = Array.isArray(rawRoles)
    ? rawRoles.filter((role): role is string => typeof role === 'string')
    : typeof rawRoles === 'string'
      ? rawRoles.split(/[\s,]+/).filter((role) => role.length > 0)
      : [];

  const resolution = resolveRoles(claimed);
  if (resolution.unknown.length > 0) {
    // Reported, not dropped: a group that maps to nothing is usually a
    // misconfigured directory, and silence makes it look like a portal bug.
    logger.warn('auth.unmapped_roles', { subject, unknown: resolution.unknown });
  }

  const scopes = scopesForRoles(resolution.roles);

  if (scopes.length === 0) {
    logger.warn('auth.no_scopes', { subject, claimed });
  }

  const clearanceClaim = config.clearanceClaim ? claims[config.clearanceClaim] : undefined;
  const unitClaim = config.unitClaim ? claims[config.unitClaim] : undefined;

  return {
    subject,
    issuer: typeof claims.iss === 'string' ? claims.iss : config.issuer,
    name: str(claims.name) ?? str(claims.preferred_username) ?? subject,
    email: str(claims.email) ?? str(claims.preferred_username) ?? '',
    // Defaults to the lowest useful clearance rather than the actor's
    // convenience: a directory that says nothing must not grant everything.
    clearance:
      clearanceClaim === 'PUBLIC' ||
      clearanceClaim === 'INTERNAL' ||
      clearanceClaim === 'CONFIDENTIAL' ||
      clearanceClaim === 'RESTRICTED'
        ? clearanceClaim
        : 'INTERNAL',
    scopes: [...scopes],
    ...(str(unitClaim) === undefined ? {} : { unit: str(unitClaim) as string }),
    ...(str(claims.jobTitle) === undefined ? {} : { role: str(claims.jobTitle) as string }),
  };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Test seam: discovery and JWKS are cached for the life of the process. */
export function resetOidcCaches(): void {
  discovered = undefined;
  jwks = undefined;
}
