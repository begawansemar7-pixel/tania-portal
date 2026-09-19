import type {
  EmbeddingProvider,
  PermissionEvaluator,
  Retriever,
  RetrievalRequest,
  ScoredChunk,
  VectorStore,
} from '@tania/core/knowledge';
import type { Actor } from '@/lib/identity/types';
import { visibilityFilter } from '../permissions/permission-evaluator';
import type { LexicalIndex } from '../indexing/lexical-index';

/** Weights for fusing the two first-pass signals. */
const VECTOR_WEIGHT = 0.55;
const LEXICAL_WEIGHT = 0.45;

/** Candidates fetched from each index before fusion. */
const CANDIDATE_MULTIPLIER = 4;

export interface HybridRetrieverDependencies {
  embeddings: EmbeddingProvider;
  vectors: VectorStore;
  lexical: LexicalIndex;
  permissions: PermissionEvaluator;
}

/**
 * Hybrid first-pass retrieval: dense similarity fused with BM25.
 *
 * Both indexes receive the same permission predicate and apply it while
 * scanning, so the fused candidate set can only ever contain material the
 * actor is allowed to read.
 */
export class HybridRetriever implements Retriever {
  readonly id = 'hybrid';

  constructor(private readonly deps: HybridRetrieverDependencies) {}

  async retrieve(request: RetrievalRequest, actor: Actor): Promise<ScoredChunk[]> {
    const filter = visibilityFilter(
      this.deps.permissions,
      actor,
      request.classificationCeiling,
    );

    const kindFilter = (candidate: ScoredChunk): boolean =>
      !request.kinds || request.kinds.length === 0 || request.kinds.includes(candidate.descriptor.kind);

    const candidateLimit = Math.max(request.limit * CANDIDATE_MULTIPLIER, request.limit);
    const [queryVector] = await this.deps.embeddings.embed([request.query]);

    const dense = queryVector
      ? await this.deps.vectors.query({ vector: queryVector, limit: candidateLimit, filter })
      : [];
    const sparse = this.deps.lexical.search(request.query, candidateLimit, filter);

    return fuse(dense, sparse).filter(kindFilter).slice(0, candidateLimit);
  }
}

/** Weighted fusion keyed by chunk id, keeping each signal for inspection. */
export function fuse(dense: ScoredChunk[], sparse: ScoredChunk[]): ScoredChunk[] {
  const merged = new Map<string, ScoredChunk>();

  for (const hit of dense) {
    merged.set(hit.chunk.id, {
      ...hit,
      score: VECTOR_WEIGHT * hit.score,
      signals: { vector: hit.score, lexical: 0 },
    });
  }

  for (const hit of sparse) {
    const existing = merged.get(hit.chunk.id);
    if (existing) {
      merged.set(hit.chunk.id, {
        ...existing,
        score: existing.score + LEXICAL_WEIGHT * hit.score,
        signals: { ...existing.signals, lexical: hit.score },
      });
      continue;
    }

    merged.set(hit.chunk.id, {
      ...hit,
      score: LEXICAL_WEIGHT * hit.score,
      signals: { vector: 0, lexical: hit.score },
    });
  }

  return [...merged.values()].sort((a, b) => b.score - a.score);
}
