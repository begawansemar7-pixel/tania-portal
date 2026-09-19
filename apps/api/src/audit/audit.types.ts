import type { RiskLevel } from '../generated/prisma/enums.js';

export interface AuditInput {
  event: string;
  actorId?: string | null;
  sessionId?: string | null;
  approvalId?: string | null;
  risk?: RiskLevel | null;
  payload: Record<string, unknown>;
}

export interface AuditHashInput extends AuditInput {
  prevHash: string;
  occurredAt: Date;
}

export interface ChainVerification {
  ok: boolean;
  count: number;
  /** Sequence number of the first event whose hash does not match. */
  brokenAtSequence?: string;
  checkedAt: string;
}
