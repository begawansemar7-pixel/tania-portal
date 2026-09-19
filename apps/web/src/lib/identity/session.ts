import { SignJWT, jwtVerify } from 'jose';
import { CLASSIFICATIONS, type Clearance } from '@tania/types';
import type { Actor } from './types';

/**
 * The portal's session: a signed cookie carrying the resolved actor.
 *
 * Signed rather than merely serialised — the cookie *is* the authorisation, so
 * anything a client could edit would let a visitor name their own scopes. HS256
 * over a configured secret keeps verification local; there is no session table
 * to consult on every request, and revocation is bounded by the short TTL.
 *
 * Nothing sensitive is stored: the actor's identity and scopes are all the
 * portal needs, and the IdP's tokens are deliberately *not* kept. The portal
 * never calls the IdP again on the user's behalf, so holding a refresh token
 * would add a theft target for no capability.
 */

export const SESSION_COOKIE = 'tania_session';

/** Set on the cookie that survives the redirect to the IdP and back. */
export const OAUTH_STATE_COOKIE = 'tania_oauth';

export interface SessionActor {
  subject: string;
  issuer: string;
  name: string;
  email: string;
  unit?: string;
  role?: string;
  clearance: Clearance;
  scopes: string[];
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function sealSession(
  actor: SessionActor,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ ...actor })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('urn:tania:portal')
    .setAudience('urn:tania:portal')
    .setExpirationTime(`${ttlSeconds}s`)
    .setSubject(actor.subject)
    .sign(key(secret));
}

/**
 * Verifies a session cookie and returns the actor it names.
 *
 * Returns `undefined` rather than throwing on anything unacceptable — an
 * expired, forged, or truncated cookie all mean the same thing to a caller:
 * nobody is signed in. Distinguishing them in the response would tell an
 * attacker which of their guesses was closer.
 */
export async function openSession(
  token: string | undefined,
  secret: string,
): Promise<SessionActor | undefined> {
  if (token === undefined || token.length === 0) return undefined;

  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: 'urn:tania:portal',
      audience: 'urn:tania:portal',
      algorithms: ['HS256'],
    });

    return toSessionActor(payload);
  } catch {
    return undefined;
  }
}

/**
 * Rebuilds the actor from claims, rejecting anything malformed.
 *
 * A signed cookie proves the payload is ours, not that it is well-shaped: a
 * secret rotated into a different deployment, or an older release's format,
 * would still verify. Everything is re-checked.
 */
function toSessionActor(payload: Record<string, unknown>): SessionActor | undefined {
  const subject = payload.subject;
  const issuer = payload.issuer;
  const name = payload.name;
  const email = payload.email;
  const clearance = payload.clearance;

  if (
    typeof subject !== 'string' ||
    subject.length === 0 ||
    typeof issuer !== 'string' ||
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    !isClearance(clearance)
  ) {
    return undefined;
  }

  const scopes = Array.isArray(payload.scopes)
    ? payload.scopes.filter((scope): scope is string => typeof scope === 'string')
    : [];

  return {
    subject,
    issuer,
    name,
    email,
    clearance,
    scopes,
    ...(typeof payload.unit === 'string' ? { unit: payload.unit } : {}),
    ...(typeof payload.role === 'string' ? { role: payload.role } : {}),
  };
}

function isClearance(value: unknown): value is Clearance {
  return typeof value === 'string' && (CLASSIFICATIONS as readonly string[]).includes(value);
}

/** The actor the rest of the portal programs against. */
export function toActor(session: SessionActor): Actor {
  return {
    // Stable across logins and unique across issuers, so an audit row points at
    // one person even if two directories use the same local subject id.
    id: `${session.issuer}#${session.subject}`,
    subject: session.subject,
    issuer: session.issuer,
    name: session.name,
    email: session.email,
    clearance: session.clearance,
    scopes: session.scopes,
    ...(session.unit === undefined ? {} : { unit: session.unit }),
    ...(session.role === undefined ? {} : { role: session.role }),
  };
}

/** Cookie attributes for the session and the short-lived OAuth state. */
export function cookieOptions(maxAgeSeconds: number, secure: boolean) {
  return {
    httpOnly: true,
    // `lax` rather than `strict`: the IdP redirects back with a top-level GET,
    // and `strict` would withhold the cookie on exactly that navigation.
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
