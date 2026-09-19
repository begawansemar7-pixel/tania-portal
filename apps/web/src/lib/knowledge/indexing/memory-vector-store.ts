import type { ScoredChunk, VectorQuery, VectorRecord, VectorStore } from '@tania/core/knowledge';
import { cosineSimilarity } from './embedding';

/**
 * In-memory vector index.
 *
 * The filter runs *before* similarity is computed. That ordering is the
 * security property, not an optimisation: a document an actor may not read is
 * never scored, so it cannot leak through ranking, counts, or timing.
 */
export class InMemoryVectorStore implements VectorStore {
  readonly id = 'memory';
  private records: VectorRecord[] = [];

  async upsert(records: VectorRecord[]): Promise<void> {
    const incoming = new Set(records.map((record) => record.chunk.id));
    this.records = this.records.filter((record) => !incoming.has(record.chunk.id));
    this.records.push(...records);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    this.records = this.records.filter((record) => record.chunk.documentId !== documentId);
  }

  async query(query: VectorQuery): Promise<ScoredChunk[]> {
    const visible = this.records.filter((record) => query.filter(record.descriptor));

    return visible
      .map((record) => ({
        chunk: record.chunk,
        descriptor: record.descriptor,
        score: cosineSimilarity(query.vector, record.vector),
        signals: { vector: cosineSimilarity(query.vector, record.vector) },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit);
  }

  async size(): Promise<number> {
    return this.records.length;
  }
}
