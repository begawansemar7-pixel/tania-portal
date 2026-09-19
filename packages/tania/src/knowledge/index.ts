/**
 * Knowledge domain — grounding answers in enterprise material.
 *
 * Two rules shape every port here:
 *
 * 1. **Permission filtering happens before scoring.** A document an actor may
 *    not read is never ranked, never embedded into a prompt, and never cited.
 * 2. **Nothing is asserted without a source.** Retrieval returns what it found
 *    and how confident it is; a caller that finds nothing must say so.
 */
import type {
  Citation,
  Classification,
  Confidence,
  Evidence,
  RetrievedDocument,
} from '@tania/types';
import type { Actor, Scope } from '../identity/index.js';

// ── Documents ────────────────────────────────────────────────────────────────

export const DOCUMENT_KINDS = [
  'PRD',
  'BRD',
  'PROPOSAL',
  'BUSINESS_CASE',
  'ARCHITECTURE',
  'SOP',
  'REPORT',
  'MEETING_MINUTES',
  'PRODUCT_DOC',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * Who may read a document.
 *
 * `classification` is the floor: an actor's clearance must reach it. `units`
 * and `scopes`, when present, narrow further — both must pass.
 */
export interface DocumentAcl {
  classification: Classification;
  /** When set, only actors from one of these organisational units. */
  units?: string[];
  /** When set, the actor must hold at least one of these scopes. */
  scopes?: Scope[];
}

export interface DocumentSection {
  /** Stable id within the document, used as a citation locator. */
  id: string;
  heading: string;
  body: string;
  /** Page or slide number when the source format has one. */
  page?: number;
}

export interface EnterpriseDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  source: string;
  owner: string;
  updatedAt: string;
  acl: DocumentAcl;
  summary: string;
  sections: DocumentSection[];
  url?: string;
  /** Free-form labels used by lexical matching and filters. */
  tags?: string[];
}

/** A retrievable unit: one passage of one document. */
export interface DocumentChunk {
  id: string;
  documentId: string;
  sectionId: string;
  heading: string;
  text: string;
  /** Position of the chunk within its document, for ordering citations. */
  ordinal: number;
  page?: number;
}

/** Document metadata plus its ACL, without the body. */
export interface DocumentDescriptor {
  id: string;
  title: string;
  kind: DocumentKind;
  source: string;
  owner: string;
  updatedAt: string;
  acl: DocumentAcl;
  summary: string;
  url?: string;
  tags?: string[];
}

// ── Ports ────────────────────────────────────────────────────────────────────

/** Where documents live before they are indexed. */
export interface DocumentStore {
  readonly id: string;
  get(documentId: string): Promise<EnterpriseDocument | undefined>;
  list(): Promise<DocumentDescriptor[]>;
  put(document: EnterpriseDocument): Promise<DocumentDescriptor>;
  remove(documentId: string): Promise<void>;
}

/** Turns text into vectors. One adapter per embedding backend. */
export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorRecord {
  chunk: DocumentChunk;
  vector: number[];
  /** Denormalised so the store can filter without a second lookup. */
  descriptor: DocumentDescriptor;
}

export interface VectorQuery {
  vector: number[];
  limit: number;
  /**
   * Called for every candidate before it is scored. Implementations MUST apply
   * this, not the caller — filtering after ranking leaks existence.
   */
  filter: (descriptor: DocumentDescriptor) => boolean;
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  descriptor: DocumentDescriptor;
  /** 0–1, higher is better. */
  score: number;
  /** How the score was produced, for debugging and evaluation. */
  signals?: Record<string, number>;
}

export interface VectorStore {
  readonly id: string;
  upsert(records: VectorRecord[]): Promise<void>;
  deleteByDocument(documentId: string): Promise<void>;
  query(query: VectorQuery): Promise<ScoredChunk[]>;
  size(): Promise<number>;
}

export interface RetrievalRequest {
  query: string;
  limit: number;
  /** Optional ceiling below the actor's own clearance. */
  classificationCeiling?: Classification;
  kinds?: DocumentKind[];
}

/** Finds candidate passages for a question, already permission-filtered. */
export interface Retriever {
  readonly id: string;
  retrieve(request: RetrievalRequest, actor: Actor): Promise<ScoredChunk[]>;
}

/** Reorders candidates using signals a first-pass retriever cannot afford. */
export interface Reranker {
  readonly id: string;
  rerank(query: string, candidates: ScoredChunk[], limit: number): Promise<ScoredChunk[]>;
}

/** Decides what an actor may read, and says why when the answer is no. */
export interface PermissionEvaluator {
  readonly id: string;
  canRead(actor: Actor, acl: DocumentAcl): PermissionDecision;
}

export interface PermissionDecision {
  allowed: boolean;
  /** User-safe explanation; never reveals the content that was withheld. */
  reason: string;
}

/** Turns ranked passages into citations an answer can point at. */
export interface CitationService {
  readonly id: string;
  /** Citations extend `Evidence`, so anything consuming evidence still works. */
  build(chunks: ScoredChunk[]): Citation[];
  /** Verifies that an answer only cites material that was actually retrieved. */
  verify(citedIds: string[], retrieved: ScoredChunk[]): CitationVerification;
}

export interface CitationVerification {
  ok: boolean;
  /** Ids referenced by the answer that were never retrieved. */
  unsupported: string[];
}

export interface IngestionRequest {
  document: EnterpriseDocument;
}

/** Writes documents into the index. Reading is not writing: separate port. */
export interface KnowledgeIngestor {
  readonly id: string;
  ingest(request: IngestionRequest, actor: Actor): Promise<IngestionResult>;
  remove(documentId: string, actor: Actor): Promise<void>;
}

export interface IngestionResult {
  documentId: string;
  chunks: number;
  /** Embedding model used, recorded so a re-index can be detected. */
  embeddingModel: string;
}

// ── Legacy-compatible retrieval ──────────────────────────────────────────────

export interface RetrievalQuery {
  query: string;
  limit: number;
  classificationCeiling?: Classification;
}

/** Retrieval plus the grounding signals a caller needs to stay honest. */
export interface GroundedRetrieval {
  evidence: Evidence[];
  confidence: Confidence;
  retrievedDocuments: RetrievedDocument[];
  /** False when nothing passed the grounding threshold. */
  grounded: boolean;
}

/**
 * The simple shape the Brain consumes: evidence, already filtered and ranked.
 *
 * `searchGrounded` is optional so a plain retriever stays valid; callers that
 * need confidence check for it rather than assuming a capability.
 */
export interface KnowledgeRetriever {
  readonly id: string;
  search(query: RetrievalQuery, actor: Actor): Promise<Evidence[]>;
  searchGrounded?(query: RetrievalQuery, actor: Actor): Promise<GroundedRetrieval>;
}

export interface DocumentRef {
  id: string;
  title: string;
  source: string;
  classification: Classification;
  updatedAt: string;
  owner?: string;
  url?: string;
}
