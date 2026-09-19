/**
 * Identity domain — who is acting, and what they are cleared to do.
 *
 * The portal, the API, and the runtime all authorise against this one shape,
 * whether the credential came from OIDC or from a first-party assertion.
 */
import type { Clearance } from '@tania/types';

/** Scopes TANIA itself defines. Deployments may add their own. */
export const TANIA_SCOPES = [
  'knowledge:read',
  'knowledge:write',
  'analytics:read',
  'document:create',
  'workflow:run',
  'workflow:approve',
  'audit:read',
  'system:admin',
] as const;

export type TaniaScope = (typeof TANIA_SCOPES)[number];

/** Known scopes keep autocomplete; deployment-specific scopes stay expressible. */
export type Scope = TaniaScope | (string & {});

export interface Actor {
  /** Internal, stable identifier used by every foreign key and audit row. */
  id: string;
  /** `sub` claim from the identity provider, or the mock subject in development. */
  subject: string;
  /** Issuer that vouched for this identity. */
  issuer: string;
  name: string;
  email: string;
  unit?: string;
  role?: string;
  clearance: Clearance;
  scopes: Scope[];
}

/** Claims a trusted first-party caller asserts about the end user. */
export interface ActorAssertion {
  subject: string;
  name: string;
  email: string;
  unit?: string;
  role?: string;
  clearance?: Clearance;
  scopes?: Scope[];
}

/** Framework-free view of an inbound request's credentials. */
export interface CredentialSource {
  header(name: string): string | undefined;
}

/**
 * Resolves a credential into an actor. Implementations: OIDC token verification,
 * first-party service assertion, or a development stub.
 */
export interface IdentityProvider {
  readonly id: string;
  resolve(credentials: CredentialSource): Promise<Actor | null>;
}

export function hasScope(actor: Actor, scope: Scope): boolean {
  return actor.scopes.includes(scope) || actor.scopes.includes('system:admin');
}

export function hasAllScopes(actor: Actor, scopes: readonly Scope[]): boolean {
  return scopes.every((scope) => hasScope(actor, scope));
}

export function missingScopes(actor: Actor, scopes: readonly Scope[]): Scope[] {
  return scopes.filter((scope) => !hasScope(actor, scope));
}
