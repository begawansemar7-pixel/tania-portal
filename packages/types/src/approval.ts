import type { RiskLevel } from './risk.js';

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type ApprovalDecision = Extract<ApprovalStatus, 'APPROVED' | 'REJECTED'>;

export const EXECUTION_STATUSES = ['NOT_EXECUTED', 'SUCCEEDED', 'FAILED'] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** A human decision gate on a high-risk action. */
export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolId: string;
  action: string;
  risk: RiskLevel;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  executionStatus?: ExecutionStatus;
  executionSummary?: string;
}
