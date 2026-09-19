import type { Confidence, RetrievedDocument } from './rag.js';
import type { Evidence } from './evidence.js';
import type { Intent } from './intent.js';
import type { ApprovalRequest } from './approval.js';
import type { RiskLevel } from './risk.js';
import type { ToolUsage } from './tool.js';
import type { TraceStep } from './trace.js';

/** Request accepted by the ask endpoint. */
export interface AskRequest {
  sessionId: string;
  message: string;
  intent?: Intent;
}

/** The full, user-safe result of one turn. */
export interface AskResponse {
  messageId: string;
  sessionId: string;
  createdAt: string;
  intent: Intent;
  answer: string;
  /** Identifier of the model that produced the answer, for audit and display. */
  model: string;
  risk: RiskLevel;
  evidence: Evidence[];
  /** Retrieval confidence, when the retriever reported it. */
  confidence?: Confidence;
  /** Documents considered during retrieval, cited or not. */
  retrievedDocuments?: RetrievedDocument[];
  trace: TraceStep[];
  toolsUsed: ToolUsage[];
  approval?: ApprovalRequest;
  suggestions: string[];
}
