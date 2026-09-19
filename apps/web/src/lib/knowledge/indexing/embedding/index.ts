import { config, type TaniaConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { HttpEmbeddingProvider } from './http-embedding-provider';
import { MockEmbeddingProvider } from './mock-embedding-provider';
import type { EmbeddingProvider } from '@tania/core/knowledge';

/**
 * Adapter selection for embeddings.
 *
 * Mirrors the LLM factory: an external provider is used only when it is fully
 * configured, and the fallback to local hashing is logged rather than silent.
 */
export function createEmbeddingProvider(cfg: TaniaConfig = config): EmbeddingProvider {
  if (cfg.rag.retriever !== 'external') {
    return new MockEmbeddingProvider();
  }

  if (!cfg.rag.baseUrl || !cfg.rag.apiKey) {
    logger.warn('embedding.credentials_missing', {
      reason:
        'TANIA_RAG_PROVIDER=external memerlukan TANIA_RAG_BASE_URL dan TANIA_RAG_API_KEY; memakai embedding lokal.',
    });
    return new MockEmbeddingProvider();
  }

  logger.info('embedding.provider_selected', { provider: 'http', model: cfg.rag.embeddingModel });

  return new HttpEmbeddingProvider({
    baseUrl: cfg.rag.baseUrl,
    apiKey: cfg.rag.apiKey,
    model: cfg.rag.embeddingModel,
    dimensions: cfg.rag.embeddingDimensions,
    timeoutMs: cfg.api.timeoutMs,
  });
}

export { MockEmbeddingProvider, embedText, cosineSimilarity, tokenize } from './mock-embedding-provider';
export { HttpEmbeddingProvider } from './http-embedding-provider';
