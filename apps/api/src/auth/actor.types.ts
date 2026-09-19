import type { Clearance } from '../generated/prisma/enums.js';

/** Identity claims resolved from a verified credential. */
export interface VerifiedIdentity {
  subject: string;
  issuer: string;
  name: string;
  email: string;
  unit?: string;
  role?: string;
  clearance: Clearance;
  scopes: string[];
}

/** A verified identity that has been projected into the database. */
export interface ActorContext extends VerifiedIdentity {
  /** Internal Actor.id used for all foreign keys. */
  id: string;
}

export const CLEARANCES: Clearance[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

export function isClearance(value: unknown): value is Clearance {
  return typeof value === 'string' && (CLEARANCES as string[]).includes(value);
}

export function hasScope(actor: ActorContext, scope: string): boolean {
  return actor.scopes.includes(scope) || actor.scopes.includes('system:admin');
}
