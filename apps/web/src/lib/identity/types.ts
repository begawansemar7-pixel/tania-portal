/**
 * Identity for the portal.
 *
 * Canonical definitions come from `@tania/core/identity`; the portal keeps this
 * module so existing imports stay stable and so the OIDC swap has one seam.
 */
export {
  TANIA_SCOPES,
  hasScope,
  hasAllScopes,
  missingScopes,
  type Actor,
  type ActorAssertion,
  type CredentialSource,
  type Scope,
} from '@tania/core/identity';

export type { Clearance } from '@tania/types';

import type { Actor } from '@tania/core/identity';

/**
 * Resolves the current actor for a request.
 *
 * Portal-local variant of `identity.IdentityProvider`: it takes the framework's
 * `Request` directly, because route handlers already hold one. Replace the mock
 * with an OIDC adapter and the rest of the portal is unaffected.
 */
export interface IdentityProvider {
  readonly id: string;
  getActor(request?: Request): Promise<Actor | null>;
}
