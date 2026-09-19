/** Data classification and the clearance needed to read it. */

export const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

/** An actor's clearance uses the same ladder as the data it may read. */
export type Clearance = Classification;

function rank(value: Classification): number {
  return CLASSIFICATIONS.indexOf(value);
}

/**
 * Permission-aware retrieval depends on this being applied *before* scoring,
 * so material above an actor's clearance never reaches a prompt or a citation.
 */
export function canAccessClassification(
  clearance: Clearance,
  classification: Classification,
): boolean {
  return rank(classification) <= rank(clearance);
}

export function isClassification(value: unknown): value is Classification {
  return typeof value === 'string' && (CLASSIFICATIONS as readonly string[]).includes(value);
}
