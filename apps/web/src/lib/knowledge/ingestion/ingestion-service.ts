import { logger } from '@/lib/logger';
import { hasScope, type Actor } from '@/lib/identity/types';
import { TaniaError } from '@tania/config';
import type {
  DocumentStore,
  EmbeddingProvider,
  EnterpriseDocument,
  IngestionRequest,
  IngestionResult,
  KnowledgeIngestor,
  VectorStore,
} from '@tania/core/knowledge';
import { chunkDocument } from './chunker';
import type { LexicalIndex } from '../indexing/lexical-index';

export interface IngestionDependencies {
  documents: DocumentStore;
  embeddings: EmbeddingProvider;
  vectors: VectorStore;
  lexical: LexicalIndex;
}

/** Writing to the knowledge base is a privileged act. */
const REQUIRED_SCOPE = 'knowledge:write';

/**
 * Ingestion pipeline: store → chunk → embed → index.
 *
 * Indexing is rebuilt for the lexical side on every change because BM25 needs
 * corpus-wide statistics; the vector side is incremental.
 */
export class IngestionService implements KnowledgeIngestor {
  readonly id = 'default';

  constructor(private readonly deps: IngestionDependencies) {}

  async ingest(request: IngestionRequest, actor: Actor): Promise<IngestionResult> {
    this.assertMayWrite(actor);

    const document = request.document;
    const descriptor = await this.deps.documents.put(document);
    const chunks = chunkDocument(document);

    const vectors = await this.deps.embeddings.embed(chunks.map((chunk) => chunk.text));
    await this.deps.vectors.deleteByDocument(document.id);
    await this.deps.vectors.upsert(
      chunks.map((chunk, index) => ({
        chunk,
        descriptor,
        vector: vectors[index] ?? [],
      })),
    );

    await this.rebuildLexical();

    logger.info('knowledge.ingested', {
      documentId: document.id,
      kind: document.kind,
      chunks: chunks.length,
      classification: document.acl.classification,
      actorId: actor.id,
    });

    return {
      documentId: document.id,
      chunks: chunks.length,
      embeddingModel: this.deps.embeddings.model,
    };
  }

  async remove(documentId: string, actor: Actor): Promise<void> {
    this.assertMayWrite(actor);

    await this.deps.documents.remove(documentId);
    await this.deps.vectors.deleteByDocument(documentId);
    await this.rebuildLexical();

    logger.info('knowledge.removed', { documentId, actorId: actor.id });
  }

  /** Indexes a whole corpus, used to bootstrap a fresh process. */
  async ingestAll(documents: readonly EnterpriseDocument[], actor: Actor): Promise<number> {
    let total = 0;
    for (const document of documents) {
      const result = await this.ingest({ document }, actor);
      total += result.chunks;
    }
    return total;
  }

  private assertMayWrite(actor: Actor): void {
    if (!hasScope(actor, REQUIRED_SCOPE)) {
      throw TaniaError.forbidden(`Menulis ke basis pengetahuan memerlukan scope ${REQUIRED_SCOPE}.`);
    }
  }

  private async rebuildLexical(): Promise<void> {
    const descriptors = await this.deps.documents.list();
    const items = [];

    for (const descriptor of descriptors) {
      const document = await this.deps.documents.get(descriptor.id);
      if (!document) continue;
      for (const chunk of chunkDocument(document)) {
        items.push({ chunk, descriptor });
      }
    }

    this.deps.lexical.build(items);
  }
}
