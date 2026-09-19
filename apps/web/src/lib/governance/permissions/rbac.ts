import type { Actor } from '@/lib/identity/types';
import { ROLE_SCOPES, isTaniaRole, scopesForRoles, separationOfDutyConflicts } from '@tania/types';
import { logger } from '@/lib/logger';

/**
 * Turning what an identity provider issues into what the policy engine checks.
 *
 * Entra ID hands out group or role claims; the policy engine reasons about
 * scopes. Mapping them in one table means adding a role is a reviewable change
 * rather than a scope grant scattered across the codebase.
 */
export interface RoleResolution {
  roles: string[];
  scopes: string[];
  /** Claims that matched no known role. Reported, never silently dropped. */
  unknown: string[];
  /** Role combinations that would let one person approve their own action. */
  conflicts: string[];
}

export function resolveRoles(claims: readonly string[]): RoleResolution {
  const roles = claims.filter(isTaniaRole);
  const unknown = claims.filter((claim) => !isTaniaRole(claim));

  if (unknown.length > 0) {
    // An unmapped role means someone was granted access that does nothing.
    // Silence here produces support tickets nobody can explain.
    logger.warn('rbac.unknown_roles', { unknown });
  }

  return {
    roles,
    scopes: scopesForRoles(roles),
    unknown,
    conflicts: separationOfDutyConflicts(roles),
  };
}

/**
 * Applies roles to an actor.
 *
 * Scopes are **replaced**, not merged: an actor whose roles were reduced must
 * lose the access those roles carried, and merging would make a demotion
 * silently ineffective.
 */
export function applyRoles(actor: Actor, claims: readonly string[]): Actor {
  const resolution = resolveRoles(claims);

  if (resolution.conflicts.length > 0) {
    logger.warn('rbac.separation_of_duty', {
      actorId: actor.id,
      roles: resolution.roles,
      conflicts: resolution.conflicts,
    });
  }

  return { ...actor, scopes: resolution.scopes };
}

/** What a role grants, for the settings screen and for review. */
export function describeRole(role: string): readonly string[] | undefined {
  return isTaniaRole(role) ? ROLE_SCOPES[role] : undefined;
}
