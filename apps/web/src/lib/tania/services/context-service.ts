import { randomUUID } from 'node:crypto';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';
import type { ChatContext } from '@tania/types';
import type { LlmMessage } from '@/lib/tania/llm';
import type { StoredMessage, TranscriptStore } from '@/lib/tania/transcript/store';

/** Everything a turn needs besides the question itself. */
export interface SessionContext {
  conversationId: string;
  /** True when this request started the conversation. */
  isNew: boolean;
  actor: Actor;
  correlationId: string;
  /** Prior turns, oldest first, bounded so a long thread cannot blow the prompt. */
  history: StoredMessage[];
  /** Sanitised, user-safe context lines derived from the caller's `context`. */
  hints: string[];
  locale: string;
}

/** How many prior messages are carried into a new turn. */
const HISTORY_LIMIT = 12;

/** Guards against a screen pushing an unbounded blob into the prompt. */
const MAX_HINT_LENGTH = 120;
const MAX_ATTRIBUTES = 8;

export class ContextService {
  constructor(private readonly transcript: TranscriptStore) {}

  /**
   * Resolves or starts a conversation and assembles its context.
   *
   * History is read from the store, never from the request — a client cannot
   * tell TANIA what it supposedly said earlier.
   */
  async resolve(input: {
    conversationId?: string;
    actor: Actor;
    correlationId: string;
    context?: ChatContext;
  }): Promise<SessionContext> {
    const isNew = !input.conversationId;
    const conversationId = input.conversationId ?? randomUUID();

    await this.ensure(conversationId, input.actor, input.correlationId);

    return {
      conversationId,
      isNew,
      actor: input.actor,
      correlationId: input.correlationId,
      history: isNew ? [] : await this.history(conversationId, input.actor, input.correlationId),
      hints: describeContext(input.context),
      locale: input.context?.locale ?? 'id-ID',
    };
  }

  /** Starts an empty conversation, for the "new conversation" action. */
  async start(actor: Actor, correlationId: string): Promise<string> {
    const conversationId = randomUUID();
    await this.ensure(conversationId, actor, correlationId);
    return conversationId;
  }

  /** Prior turns rendered for the model, oldest first. */
  toLlmHistory(context: SessionContext): LlmMessage[] {
    return context.history.map((message) => ({
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: message.content,
    }));
  }

  private async ensure(conversationId: string, actor: Actor, correlationId: string): Promise<void> {
    try {
      await this.transcript.ensureSession(conversationId, actor);
    } catch (error) {
      // Persistence is best effort: losing history must not cost an answer.
      logger.warn('context.session_not_persisted', {
        correlationId,
        conversationId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async history(
    conversationId: string,
    actor: Actor,
    correlationId: string,
  ): Promise<StoredMessage[]> {
    try {
      const conversation = await this.transcript.loadConversation(conversationId, actor);
      return conversation.messages.slice(-HISTORY_LIMIT);
    } catch (error) {
      logger.warn('context.history_unavailable', {
        correlationId,
        conversationId,
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

/**
 * Turns caller-supplied context into short, bounded lines.
 *
 * Pure and exported so the rules are testable: truncation, attribute cap, and
 * the refusal to pass anything through unlabelled.
 */
export function describeContext(context?: ChatContext): string[] {
  if (!context) return [];

  const lines: string[] = [];

  if (context.surface) {
    lines.push(`layar ${truncate(context.surface)}`);
  }
  if (context.focus) {
    lines.push(`fokus ${truncate(context.focus.type)}:${truncate(context.focus.id)}`);
  }
  for (const [key, value] of Object.entries(context.attributes ?? {}).slice(0, MAX_ATTRIBUTES)) {
    lines.push(`${truncate(key)}=${truncate(value)}`);
  }

  return lines;
}

function truncate(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > MAX_HINT_LENGTH ? `${trimmed.slice(0, MAX_HINT_LENGTH)}…` : trimmed;
}
