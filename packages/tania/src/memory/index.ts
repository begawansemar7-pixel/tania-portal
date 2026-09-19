/**
 * Memory domain — what TANIA is allowed to remember.
 *
 * Memory is governed data: every record carries a scope, a classification, and
 * an owner, so it can be filtered on read and deleted on request. Retention is
 * a deployment policy, not a hard-coded default.
 */
import type { Classification } from '@tania/types';
import type { Actor } from '../identity/index.js';

export const MEMORY_SCOPES = ['SESSION', 'ACTOR', 'ORGANISATION'] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  /** Stable key within its scope, e.g. "preference.language". */
  key: string;
  value: string;
  classification: Classification;
  /** Owner for SESSION and ACTOR scoped records. */
  actorId?: string;
  sessionId?: string;
  createdAt: string;
  updatedAt?: string;
  /** Absent means "retained until deleted"; deployments should set a policy. */
  expiresAt?: string;
}

export interface MemoryWrite {
  scope: MemoryScope;
  key: string;
  value: string;
  classification: Classification;
  sessionId?: string;
  expiresAt?: string;
}

export interface MemoryQuery {
  scope?: MemoryScope;
  sessionId?: string;
  /** Free-text match over key and value. */
  query?: string;
  limit: number;
}

/**
 * Reads are permission-aware: an implementation returns only records the actor
 * may see, and `forget` must be honoured for data-subject requests.
 */
export interface MemoryStore {
  readonly id: string;
  remember(write: MemoryWrite, actor: Actor): Promise<MemoryRecord>;
  recall(query: MemoryQuery, actor: Actor): Promise<MemoryRecord[]>;
  forget(recordId: string, actor: Actor): Promise<void>;
  forgetSession(sessionId: string, actor: Actor): Promise<number>;
}
