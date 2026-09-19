import { config, type TaniaConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';
import type { LlmProvider } from '@/lib/tania/llm';
import { ENTERPRISE_DOCUMENTS } from './corpus/enterprise-documents';
import { ClearanceAndAclEvaluator } from './permissions/permission-evaluator';
import { InMemoryDocumentStore } from './indexing/memory-document-store';
import { InMemoryVectorStore } from './indexing/memory-vector-store';
import { LexicalIndex } from './indexing/lexical-index';
import { createEmbeddingProvider } from './indexing/embedding';
import { IngestionService } from './ingestion/ingestion-service';
import { HybridRetriever } from './retrieval/hybrid-retriever';
import { LexicalReranker } from './reranking/lexical-reranker';
import { MarkerCitationService } from './citations/citation-service';
import { RagKnowledgeRetriever, RagService } from './rag-service';

/**
 * The actor the indexer runs as.
 *
 * Indexing deliberately sees every document: filtering happens per query,
 * against the *asking* actor. Putting it here instead would mean re-indexing
 * the corpus for every clearance level, and would silently drop material the
 * moment someone with narrow access triggered a rebuild.
 */
const INDEXER_ACTOR: Actor = {
  id: 'system.indexer',
  subject: 'system.indexer',
  issuer: 'urn:tania:system',
  name: 'TANIA Indexer',
  email: 'indexer@tania.local',
  clearance: 'RESTRICTED',
  scopes: ['knowledge:read', 'knowledge:write'],
};

export interface KnowledgeStack {
  documents: InMemoryDocumentStore;
  ingestion: IngestionService;
  rag: RagService;
  retriever: RagKnowledgeRetriever;
  embeddingModel: string;
  /** Indexes the seed corpus once per process. */
  ensureIndexed(): Promise<void>;
}

export interface KnowledgeStackOptions {
  llm: LlmProvider;
  cfg?: TaniaConfig;
  /** Overridden in tests to index a controlled corpus. */
  corpus?: readonly (typeof ENTERPRISE_DOCUMENTS)[number][];
}

/**
 * Builds the knowledge pipeline: store → ingestion → hybrid retrieval →
 * reranking → citations → grounded answering.
 *
 * Every stage is an injected port, so replacing the in-memory index with
 * pgvector, or the hashed embeddings with a real model, is a change here.
 */
export function createKnowledgeStack(options: KnowledgeStackOptions): KnowledgeStack {
  const cfg = options.cfg ?? config;
  const corpus = options.corpus ?? ENTERPRISE_DOCUMENTS;

  const documents = new InMemoryDocumentStore();
  const embeddings = createEmbeddingProvider(cfg);
  const vectors = new InMemoryVectorStore();
  const lexical = new LexicalIndex();
  const permissions = new ClearanceAndAclEvaluator();

  const ingestion = new IngestionService({ documents, embeddings, vectors, lexical });
  const retriever = new HybridRetriever({ embeddings, vectors, lexical, permissions });
  const reranker = new LexicalReranker({ idf: (term) => lexical.idf(term) });
  const citations = new MarkerCitationService();

  let indexing: Promise<void> | undefined;
  const ensureIndexed = async (): Promise<void> => {
    indexing ??= (async () => {
      const chunks = await ingestion.ingestAll(corpus, INDEXER_ACTOR);
      logger.info('knowledge.index_ready', {
        documents: corpus.length,
        chunks,
        embeddingProvider: embeddings.id,
        embeddingModel: embeddings.model,
      });
    })();

    await indexing;
  };

  const rag = new RagService({
    ready: ensureIndexed,
    idf: (term) => lexical.idf(term),
    retriever,
    reranker,
    citations,
    llm: options.llm,
    topK: cfg.rag.topK,
    minScore: cfg.rag.minScore,
  });

  return {
    documents,
    ingestion,
    rag,
    retriever: new RagKnowledgeRetriever(rag),
    embeddingModel: embeddings.model,
    ensureIndexed,
  };
}

export { ENTERPRISE_DOCUMENTS } from './corpus/enterprise-documents';
export { ClearanceAndAclEvaluator, visibilityFilter } from './permissions/permission-evaluator';
export { RagService, RagKnowledgeRetriever, NO_SOURCE_ANSWER } from './rag-service';
export { MarkerCitationService, toRetrievedDocuments } from './citations/citation-service';
export { LexicalReranker } from './reranking/lexical-reranker';
export { HybridRetriever } from './retrieval/hybrid-retriever';
export { evaluateGrounding } from './retrieval/grounding-policy';
export { IngestionService } from './ingestion/ingestion-service';
export { InMemoryDocumentStore } from './indexing/memory-document-store';
export { InMemoryVectorStore } from './indexing/memory-vector-store';
export { LexicalIndex } from './indexing/lexical-index';
export { chunkDocument } from './ingestion/chunker';
export { createEmbeddingProvider, MockEmbeddingProvider } from './indexing/embedding';
