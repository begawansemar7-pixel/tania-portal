/**
 * Context domain — everything a request carries besides its message.
 *
 * `RequestContext` is created at the API boundary and travels unchanged through
 * Brain, orchestration, and governance, so one correlation id ties the whole
 * path together.
 */
import type { CorrelationId } from '@tania/types';
import type { Actor } from '../identity/index.js';

export const CHANNELS = ['portal', 'voice', 'api', 'scheduler'] as const;

export type Channel = (typeof CHANNELS)[number];

export interface RequestContext {
  correlationId: CorrelationId;
  sessionId: string;
  actor: Actor;
  channel: Channel;
  /** BCP-47 tag; drives the language TANIA answers in. */
  locale?: string;
  startedAt: string;
}

export interface ConversationTurn {
  role: 'user' | 'tania';
  content: string;
  at: string;
}

export interface ConversationContext {
  sessionId: string;
  turns: ConversationTurn[];
  /** Short, rolling summary of older turns; never hidden reasoning. */
  summary?: string;
}

/** Loads and extends the conversation a request belongs to. */
export interface ContextProvider {
  readonly id: string;
  load(sessionId: string, actor: Actor): Promise<ConversationContext>;
  append(sessionId: string, turn: ConversationTurn, actor: Actor): Promise<void>;
}
