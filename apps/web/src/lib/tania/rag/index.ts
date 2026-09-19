import { config, type TaniaConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { MockKnowledgeRetriever } from './mock-retriever';
import type { KnowledgeRetriever } from './retriever';

export function createRetriever(cfg: TaniaConfig = config): KnowledgeRetriever {
  if (cfg.rag.retriever === 'external') {
    logger.warn('rag.external_not_configured', {
      reason: 'External retriever is not implemented; falling back to mock retriever.',
    });
  }
  return new MockKnowledgeRetriever();
}

export type { KnowledgeRetriever, RetrievalQuery } from './retriever';
