import type { Request } from 'express';
import type { VerifiedIdentity } from './actor.types.js';

/**
 * Credential verification seam.
 *
 * `ServiceTokenVerifier` trusts a first-party caller that asserts the end user;
 * `OidcTokenVerifier` verifies a user's own OIDC access token. Swapping between
 * them is a configuration change, not a code change.
 */
export interface TokenVerifier {
  readonly mode: string;
  verify(request: Request): Promise<VerifiedIdentity>;
}

export const TOKEN_VERIFIER = Symbol('TANIA_TOKEN_VERIFIER');

export function readBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
