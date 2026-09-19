/**
 * Reasoning domain — turning evidence into an answer.
 *
 * `LlmResult.text` is the user-facing answer. Hidden reasoning is never part of
 * any contract here, and must never be persisted or rendered.
 */
import type { Evidence, Intent } from '@tania/types';
import type { RequestContext } from '../context/index.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmRequest {
  messages: LlmMessage[];
  intent: Intent;
  evidence: Evidence[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResult {
  text: string;
  model: string;
  suggestions: string[];
  usage?: LlmUsage;
}

/**
 * Provider-agnostic model access. One adapter per gateway or vendor.
 *
 * Business logic depends on this interface only: no service, route, or
 * component may name a vendor. Streaming is optional — a caller checks
 * `supportsStreaming` and falls back to `complete` when it is false.
 */
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  readonly supportsStreaming: boolean;
  complete(request: LlmRequest): Promise<LlmResult>;
  /**
   * Yields chunks of the *answer* as they are produced.
   *
   * Never yields deliberation: what a caller streams is what the user may
   * read. Implementations without native streaming should omit this method.
   */
  stream?(request: LlmRequest): AsyncIterable<LlmStreamChunk>;
}

export interface LlmStreamChunk {
  /** Incremental answer text. */
  text: string;
  /** Present on the final chunk. */
  done?: boolean;
  /**
   * Optional complete result on the final chunk, for adapters that can supply
   * more than text (suggestions, usage). Adapters that cannot simply omit it.
   */
  result?: LlmResult;
}

export interface ReasoningRequest {
  question: string;
  intent: Intent;
  evidence: Evidence[];
  context: RequestContext;
}

export interface ReasoningResult {
  answer: string;
  suggestions: string[];
  /** Ids of the evidence the answer actually relies on. */
  groundedIn: string[];
}

export interface Reasoner {
  readonly id: string;
  reason(request: ReasoningRequest): Promise<ReasoningResult>;
}
