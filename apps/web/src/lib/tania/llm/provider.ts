/**
 * LLM abstraction for the portal.
 *
 * The contract is the shared `reasoning.LlmProvider` port: implementations here
 * satisfy the same interface any other TANIA service programs against.
 */
export type {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStreamChunk,
  LlmUsage,
} from '@tania/core/reasoning';
