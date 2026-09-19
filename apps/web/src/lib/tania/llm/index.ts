import { config, type TaniaConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { HttpLlmProvider } from './http-provider';
import { MockLlmProvider } from './mock-provider';
import type { LlmProvider } from './provider';

/**
 * Adapter selection.
 *
 * The only place in the portal that knows which model backend is in use. When
 * an external provider is requested but its credentials are missing, the mock
 * takes over and says so — the portal stays usable, and nobody has to guess
 * why answers look synthetic.
 */
export function createLlmProvider(cfg: TaniaConfig = config): LlmProvider {
  if (cfg.llm.provider !== 'external') {
    return new MockLlmProvider(cfg.llm.model, cfg.llm.streamDelayMs);
  }

  if (!cfg.llm.baseUrl || !cfg.llm.apiKey) {
    logger.warn('llm.credentials_missing', {
      reason:
        'TANIA_LLM_PROVIDER=external memerlukan TANIA_LLM_BASE_URL dan TANIA_LLM_API_KEY; memakai mock provider.',
    });
    return new MockLlmProvider(cfg.llm.model, cfg.llm.streamDelayMs);
  }

  logger.info('llm.provider_selected', { provider: 'http', model: cfg.llm.model });

  return new HttpLlmProvider({
    baseUrl: cfg.llm.baseUrl,
    apiKey: cfg.llm.apiKey,
    model: cfg.llm.model,
    timeoutMs: cfg.api.timeoutMs,
  });
}

export { MockLlmProvider } from './mock-provider';
export { HttpLlmProvider } from './http-provider';
export type {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStreamChunk,
  LlmUsage,
} from './provider';
