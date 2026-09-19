import { TaniaError } from '@tania/config';
import type { Actor } from '@/lib/identity/types';
import type { AskResponse } from '@/lib/tania/types';

export interface TranscriptTurn {
  messageId: string;
  question: string;
  response: AskResponse;
}

/** One stored message, as read back when a conversation is resumed. */
export interface StoredMessage {
  id: string;
  role: 'user' | 'tania';
  content: string;
  createdAt: string;
  intent?: string;
}

export interface StoredConversation {
  conversationId: string;
  title?: string;
  messages: StoredMessage[];
}

/**
 * Durable conversation history.
 *
 * Writes are best effort — losing history must never cost the user an answer —
 * while reads are what make a conversation resumable after a reload.
 */
export interface TranscriptStore {
  readonly id: string;
  readonly durable: boolean;
  ensureSession(conversationId: string, actor: Actor): Promise<void>;
  recordTurn(conversationId: string, turn: TranscriptTurn, actor: Actor): Promise<void>;
  /** Returns an empty conversation when the id is unknown. */
  loadConversation(conversationId: string, actor: Actor): Promise<StoredConversation>;
}

/**
 * Process-local history, used when no backend is configured.
 *
 * Honest about its limits: it keeps a conversation alive across requests in one
 * server process, and loses it on restart — hence `durable: false`.
 */
export class InMemoryTranscriptStore implements TranscriptStore {
  readonly id = 'memory';
  readonly durable = false;

  /**
   * Keyed by conversation, and each entry remembers who opened it.
   *
   * The owner is not decoration. Without it this store hands any conversation
   * to whoever names its id, while the durable path behind `apps/api` refuses
   * with a `ForbiddenException` — two implementations of one interface with
   * different security semantics, which is exactly the kind of gap that
   * survives into production. `InMemoryTaskStore` already scopes by owner; this
   * brings the transcript in line.
   *
   * It is invisible today only because a single mock actor holds every scope.
   * The day real identity lands it becomes an IDOR.
   */
  private readonly conversations = new Map<
    string,
    { ownerId: string; conversation: StoredConversation }
  >();

  async ensureSession(conversationId: string, actor: Actor): Promise<void> {
    const existing = this.conversations.get(conversationId);

    if (existing === undefined) {
      this.conversations.set(conversationId, {
        ownerId: actor.id,
        conversation: { conversationId, messages: [] },
      });
      return;
    }

    // Naming someone else's conversation must not quietly transfer it.
    if (existing.ownerId !== actor.id) {
      throw TaniaError.forbidden('This conversation belongs to another actor.');
    }
  }

  async recordTurn(conversationId: string, turn: TranscriptTurn, actor: Actor): Promise<void> {
    await this.ensureSession(conversationId, actor);
    const entry = this.conversations.get(conversationId);
    if (!entry || entry.ownerId !== actor.id) return;

    const { conversation } = entry;
    const createdAt = new Date().toISOString();
    conversation.title ??= turn.question.slice(0, 80);
    conversation.messages.push(
      { id: `${turn.messageId}-user`, role: 'user', content: turn.question, createdAt },
      {
        id: turn.messageId,
        role: 'tania',
        content: turn.response.answer,
        createdAt,
        intent: turn.response.intent,
      },
    );
  }

  /**
   * An unknown id and someone else's id are answered identically.
   *
   * Deliberate: a 403 here would confirm that a conversation exists, turning
   * the endpoint into an existence oracle for anyone holding a stolen id. The
   * interface already promises an empty conversation for an unknown id, so
   * this stays within its contract. The durable path can afford to be explicit
   * because the backend authenticates the caller first.
   */
  async loadConversation(conversationId: string, actor: Actor): Promise<StoredConversation> {
    const entry = this.conversations.get(conversationId);
    return entry !== undefined && entry.ownerId === actor.id
      ? entry.conversation
      : { conversationId, messages: [] };
  }
}

/** Discards everything; used where history is explicitly not wanted. */
export class NoopTranscriptStore implements TranscriptStore {
  readonly id = 'noop';
  readonly durable = false;

  async ensureSession(_conversationId: string, _actor?: Actor): Promise<void> {}
  async recordTurn(
    _conversationId: string,
    _turn: TranscriptTurn,
    _actor?: Actor,
  ): Promise<void> {}
  async loadConversation(conversationId: string, _actor?: Actor): Promise<StoredConversation> {
    return { conversationId, messages: [] };
  }
}
