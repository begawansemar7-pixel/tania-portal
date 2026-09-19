/**
 * The governance record.
 *
 * Every meaningful AI action produces one of these, and the fields are fixed by
 * what an auditor needs to answer four questions without reading code: who
 * asked, what TANIA understood, what it touched, and what came of it.
 *
 * What is *not* here matters as much: no prompts, no model output beyond a
 * user-safe result, and no reasoning. An audit trail that carries deliberation
 * becomes a second, unreviewed disclosure channel.
 */
import type { CapabilityCategory } from './capability.js';
import type { Classification } from './classification.js';
import type { Intent } from './intent.js';
import type { RiskLevel } from './risk.js';

/** What was done, at the granularity an auditor cares about. */
export const GOVERNANCE_ACTIONS = [
  'RETRIEVE',
  'ANALYZE',
  'DRAFT',
  'EXECUTE',
  'APPROVE',
  'REJECT',
  'CANCEL',
  'VERIFY',
] as const;

export type GovernanceAction = (typeof GOVERNANCE_ACTIONS)[number];

export const GOVERNANCE_RESULTS = ['SUCCEEDED', 'FAILED', 'BLOCKED', 'AWAITING_APPROVAL'] as const;

export type GovernanceResult = (typeof GOVERNANCE_RESULTS)[number];

/** What data an action reached, without naming content. */
export interface DataAccessRecord {
  /** Document, dataset or system identifiers touched. */
  resources: string[];
  /** Highest classification reached. */
  classification: Classification;
  /** How many records or documents were read. */
  count: number;
  /** True when the actor's permissions narrowed what was returned. */
  filtered: boolean;
}

/**
 * One auditable AI action.
 *
 * The ten fields are the agreed contract. `verification` is included because a
 * result nobody checked is a different thing from one that was.
 */
export interface GovernanceEvent {
  /** Who it was done for. */
  user: string;
  /** What TANIA understood the request to be. */
  intent: Intent;
  /** Which specialist carried it. Absent for actions no agent owns. */
  agent?: string;
  /** Which registered tool was used. Absent for decisions, not executions. */
  tool?: string;
  /** What data it reached. */
  dataAccess: DataAccessRecord;
  action: GovernanceAction;
  result: GovernanceResult;
  /** Whether the outcome was checked, and what was found. */
  verification: { ok: boolean; issues: string[] };
  timestamp: string;
  correlationId: string;

  // Context that makes a record findable. Not part of the agreed ten, but an
  // audit row nobody can trace back to a task is of limited use.
  taskId?: string;
  sessionId?: string;
  risk?: RiskLevel;
  category?: CapabilityCategory;
  approvalId?: string;
}

/** Fields that must be present on every record, checked at the boundary. */
export const REQUIRED_GOVERNANCE_FIELDS = [
  'user',
  'intent',
  'dataAccess',
  'action',
  'result',
  'verification',
  'timestamp',
  'correlationId',
] as const;

/**
 * Whether a record carries everything the contract demands.
 *
 * Enforced rather than trusted: a governance sink that silently accepts a
 * half-filled record produces an audit trail that looks complete and is not.
 */
export function isCompleteGovernanceEvent(value: unknown): value is GovernanceEvent {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;

  return REQUIRED_GOVERNANCE_FIELDS.every((field) => {
    const present = record[field];
    if (present === undefined || present === null) return false;
    if (typeof present === 'string') return present.length > 0;
    return true;
  });
}

// ── RBAC ─────────────────────────────────────────────────────────────────────

/**
 * Roles, as an enterprise grants them.
 *
 * Scopes are what the policy engine checks; roles are what an identity
 * provider actually issues. Mapping one to the other in a single table means a
 * new role is a reviewable change, not a scattered set of scope grants.
 */
export const TANIA_ROLES = [
  'viewer',
  'analyst',
  'creator',
  'operator',
  'approver',
  'auditor',
  'admin',
] as const;

export type TaniaRole = (typeof TANIA_ROLES)[number];

export function isTaniaRole(value: unknown): value is TaniaRole {
  return (TANIA_ROLES as readonly unknown[]).includes(value);
}

/**
 * What each role may do.
 *
 * Deliberately additive and narrow. Note that `operator` can run workflows but
 * **cannot approve them**: separating the two is the point of an approval gate,
 * and a role holding both would make the gate ceremonial.
 */
export const ROLE_SCOPES: Record<TaniaRole, readonly string[]> = {
  viewer: ['knowledge:read'],
  analyst: ['knowledge:read', 'analytics:read'],
  creator: ['knowledge:read', 'analytics:read', 'document:create'],
  operator: ['knowledge:read', 'analytics:read', 'document:create', 'workflow:run'],
  approver: ['knowledge:read', 'analytics:read', 'workflow:approve'],
  auditor: ['knowledge:read', 'audit:read'],
  admin: [
    'knowledge:read',
    'knowledge:write',
    'analytics:read',
    'document:create',
    'workflow:run',
    'workflow:approve',
    'audit:read',
    'system:admin',
  ],
};

/** The scopes a set of roles grants, with duplicates removed. */
export function scopesForRoles(roles: readonly string[]): string[] {
  const granted = new Set<string>();

  for (const role of roles) {
    if (!isTaniaRole(role)) continue;
    for (const scope of ROLE_SCOPES[role]) granted.add(scope);
  }

  return [...granted].sort();
}

/**
 * Roles that, held together, would let one person approve their own action.
 *
 * Returned rather than rejected: whether to permit it is a deployment's
 * decision, but it should never be an accident.
 */
export function separationOfDutyConflicts(roles: readonly string[]): string[] {
  const held = new Set(roles);
  const conflicts: string[] = [];

  if (held.has('operator') && held.has('approver')) {
    conflicts.push('operator + approver: dapat menyetujui aksinya sendiri.');
  }
  if (held.has('admin') && held.size > 1) {
    conflicts.push('admin sudah mencakup peran lain; kombinasi ini menyamarkan hak sebenarnya.');
  }

  return conflicts;
}
