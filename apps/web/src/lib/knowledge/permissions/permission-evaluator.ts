import { canAccessClassification } from '@tania/types';
import { hasScope, type Actor } from '@/lib/identity/types';
import type {
  DocumentAcl,
  DocumentDescriptor,
  PermissionDecision,
  PermissionEvaluator,
} from '@tania/core/knowledge';

/**
 * The single place that decides what an actor may read.
 *
 * Every rule is conjunctive: clearance, then unit, then scope. A denial says
 * which rule failed without revealing anything about the content withheld —
 * "you may not read this" must never become "here is what you are missing".
 */
export class ClearanceAndAclEvaluator implements PermissionEvaluator {
  readonly id = 'clearance-acl';

  canRead(actor: Actor, acl: DocumentAcl): PermissionDecision {
    if (!canAccessClassification(actor.clearance, acl.classification)) {
      return {
        allowed: false,
        reason: `Klasifikasi ${acl.classification} di atas clearance ${actor.clearance}.`,
      };
    }

    if (acl.units && acl.units.length > 0) {
      const unit = actor.unit;
      if (!unit || !acl.units.includes(unit)) {
        return { allowed: false, reason: 'Dokumen dibatasi untuk unit organisasi tertentu.' };
      }
    }

    if (acl.scopes && acl.scopes.length > 0) {
      const holds = acl.scopes.some((scope) => hasScope(actor, scope));
      if (!holds) {
        return { allowed: false, reason: 'Dokumen memerlukan scope akses yang tidak Anda miliki.' };
      }
    }

    return { allowed: true, reason: 'Diizinkan oleh clearance dan ACL dokumen.' };
  }
}

/**
 * Builds the predicate the vector store applies *before* scoring.
 *
 * Returned as a filter rather than a post-processing step on purpose: ranking
 * a document an actor cannot read would leak its existence through scores,
 * counts, and latency.
 */
export function visibilityFilter(
  evaluator: PermissionEvaluator,
  actor: Actor,
  ceiling?: DocumentAcl['classification'],
): (descriptor: DocumentDescriptor) => boolean {
  return (descriptor) => {
    if (!evaluator.canRead(actor, descriptor.acl).allowed) return false;
    if (ceiling && !canAccessClassification(ceiling, descriptor.acl.classification)) return false;
    return true;
  };
}
