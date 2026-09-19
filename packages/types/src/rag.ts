/**
 * Retrieval-augmented generation contract.
 *
 * The shape exists to make grounding checkable: an answer arrives with the
 * passages it used, how confident retrieval was, and which documents were
 * considered — so "unsupported" is a state the caller can detect, not a
 * judgement call.
 */
import type { Classification } from './classification.js';
import type { Evidence } from './evidence.js';

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export interface Confidence {
  /** 0–1, derived from retrieval scores and their agreement. */
  score: number;
  level: ConfidenceLevel;
  /** User-safe explanation, e.g. "3 sumber sepakat". */
  rationale: string;
}

/** A passage an answer points at. */
export interface Citation extends Evidence {
  documentId: string;
  /** Section or page the passage came from. */
  locator: string;
  /** 1-based marker used in the answer text, e.g. [1]. */
  marker: number;
}

/** A document that reached the ranked set, whether or not it was cited. */
export interface RetrievedDocument {
  documentId: string;
  title: string;
  kind: string;
  source: string;
  classification: Classification;
  updatedAt: string;
  /** Best chunk score from this document. */
  score: number;
  /** Number of passages from this document that survived ranking. */
  passages: number;
  cited: boolean;
}

export interface RagResponse {
  answer: string;
  citations: Citation[];
  confidence: Confidence;
  retrievedDocuments: RetrievedDocument[];
}

/** True when an answer may assert facts: it has citations and enough confidence. */
export function isGrounded(response: RagResponse): boolean {
  return response.citations.length > 0 && response.confidence.level !== 'NONE';
}
