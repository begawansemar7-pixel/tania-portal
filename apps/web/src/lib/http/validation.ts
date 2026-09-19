import { ApiError } from './api-error';
import { DOCUMENT_KINDS, type DocumentKind } from '@tania/core/knowledge';
import type { AskRequest, Intent } from '@/lib/tania/types';
import type { ChatContext, Classification, TaniaChatRequest } from '@tania/types';

const INTENTS: Intent[] = ['ANALYZE', 'CREATE', 'SEARCH', 'AUTOMATE', 'CONVERSE'];

const MAX_MESSAGE_LENGTH = 4000;

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ApiError('BAD_REQUEST', 'Request body must be a JSON object.');
  }
  return payload as Record<string, unknown>;
}

/** Validation at the API boundary — never trust the client payload. */
export function parseAskRequest(payload: unknown): AskRequest {
  const body = asRecord(payload);

  const message = body.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new ApiError('BAD_REQUEST', '`message` is required and must be a non-empty string.');
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError('BAD_REQUEST', `\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const sessionId = body.sessionId;
  if (sessionId !== undefined && typeof sessionId !== 'string') {
    throw new ApiError('BAD_REQUEST', '`sessionId` must be a string when provided.');
  }

  const intent = body.intent;
  if (intent !== undefined && !INTENTS.includes(intent as Intent)) {
    throw new ApiError('BAD_REQUEST', `\`intent\` must be one of: ${INTENTS.join(', ')}.`);
  }

  return {
    sessionId: (sessionId as string | undefined) ?? crypto.randomUUID(),
    message: message.trim(),
    intent: intent as Intent | undefined,
  };
}

export interface ApprovalDecisionRequest {
  approvalId: string;
  decision: 'APPROVED' | 'REJECTED';
}

export function parseApprovalDecision(payload: unknown): ApprovalDecisionRequest {
  const body = asRecord(payload);

  const approvalId = body.approvalId;
  if (typeof approvalId !== 'string' || approvalId.length === 0) {
    throw new ApiError('BAD_REQUEST', '`approvalId` is required.');
  }

  const decision = body.decision;
  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    throw new ApiError('BAD_REQUEST', '`decision` must be APPROVED or REJECTED.');
  }

  return { approvalId, decision };
}

// ── Conversational endpoint ──────────────────────────────────────────────────

const MAX_CONTEXT_ATTRIBUTES = 8;
const MAX_CONTEXT_VALUE_LENGTH = 200;
const MAX_ID_LENGTH = 64;

function parseChatContext(value: unknown): ChatContext | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('BAD_REQUEST', '`context` must be an object when provided.');
  }

  const source = value as Record<string, unknown>;
  const context: ChatContext = {};

  if (source.surface !== undefined) {
    if (typeof source.surface !== 'string' || source.surface.length > MAX_CONTEXT_VALUE_LENGTH) {
      throw new ApiError('BAD_REQUEST', '`context.surface` must be a short string.');
    }
    context.surface = source.surface;
  }

  if (source.locale !== undefined) {
    if (typeof source.locale !== 'string' || source.locale.length > 35) {
      throw new ApiError('BAD_REQUEST', '`context.locale` must be a BCP-47 tag.');
    }
    context.locale = source.locale;
  }

  if (source.focus !== undefined) {
    const focus = source.focus as Record<string, unknown>;
    if (
      typeof focus !== 'object' ||
      focus === null ||
      typeof focus.type !== 'string' ||
      typeof focus.id !== 'string'
    ) {
      throw new ApiError('BAD_REQUEST', '`context.focus` must be { type, id }.');
    }
    context.focus = { type: focus.type, id: focus.id };
  }

  if (source.attributes !== undefined) {
    if (typeof source.attributes !== 'object' || source.attributes === null) {
      throw new ApiError('BAD_REQUEST', '`context.attributes` must be an object.');
    }

    const entries = Object.entries(source.attributes as Record<string, unknown>);
    if (entries.length > MAX_CONTEXT_ATTRIBUTES) {
      throw new ApiError(
        'BAD_REQUEST',
        `\`context.attributes\` accepts at most ${MAX_CONTEXT_ATTRIBUTES} entries.`,
      );
    }

    const attributes: Record<string, string> = {};
    for (const [key, entry] of entries) {
      if (typeof entry !== 'string' || entry.length > MAX_CONTEXT_VALUE_LENGTH) {
        throw new ApiError(
          'BAD_REQUEST',
          `\`context.attributes.${key}\` must be a string of at most ${MAX_CONTEXT_VALUE_LENGTH} characters.`,
        );
      }
      attributes[key] = entry;
    }
    context.attributes = attributes;
  }

  return context;
}

/**
 * Validation for `POST /api/tania/chat`.
 *
 * Conversation history is never accepted here — it is read from the store — so
 * a caller cannot forge what TANIA believes was already said.
 */
export function parseChatRequest(payload: unknown): TaniaChatRequest {
  const body = asRecord(payload);

  const message = body.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new ApiError('BAD_REQUEST', '`message` is required and must be a non-empty string.');
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(
      'BAD_REQUEST',
      `\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters.`,
    );
  }

  const conversationId = body.conversationId;
  if (
    conversationId !== undefined &&
    (typeof conversationId !== 'string' ||
      conversationId.length === 0 ||
      conversationId.length > MAX_ID_LENGTH)
  ) {
    throw new ApiError('BAD_REQUEST', '`conversationId` must be a short string when provided.');
  }

  const intent = body.intent;
  if (intent !== undefined && !INTENTS.includes(intent as Intent)) {
    throw new ApiError('BAD_REQUEST', `\`intent\` must be one of: ${INTENTS.join(', ')}.`);
  }

  const stream = body.stream;
  if (stream !== undefined && typeof stream !== 'boolean') {
    throw new ApiError('BAD_REQUEST', '`stream` must be a boolean when provided.');
  }

  const context = parseChatContext(body.context);

  return {
    message: message.trim(),
    ...(conversationId === undefined ? {} : { conversationId: conversationId as string }),
    ...(intent === undefined ? {} : { intent: intent as Intent }),
    ...(stream === undefined ? {} : { stream: stream as boolean }),
    ...(context === undefined ? {} : { context }),
  };
}

// ── Knowledge search ─────────────────────────────────────────────────────────

const CLASSIFICATIONS: Classification[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

export interface KnowledgeSearchRequest {
  query: string;
  limit: number;
  classificationCeiling?: Classification;
  kinds?: DocumentKind[];
}

/**
 * Validation for `POST /api/tania/knowledge/search`.
 *
 * `classificationCeiling` can only ever narrow what a caller sees: the actor's
 * own clearance is applied server-side regardless of what is asked for here.
 */
export function parseKnowledgeSearchRequest(payload: unknown): KnowledgeSearchRequest {
  const body = asRecord(payload);

  const query = body.query;
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new ApiError('BAD_REQUEST', '`query` is required and must be a non-empty string.');
  }
  if (query.length > MAX_MESSAGE_LENGTH) {
    throw new ApiError(
      'BAD_REQUEST',
      `\`query\` must be at most ${MAX_MESSAGE_LENGTH} characters.`,
    );
  }

  const limit = body.limit;
  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20)) {
    throw new ApiError('BAD_REQUEST', '`limit` must be an integer between 1 and 20.');
  }

  const ceiling = body.classificationCeiling;
  if (ceiling !== undefined && !CLASSIFICATIONS.includes(ceiling as Classification)) {
    throw new ApiError(
      'BAD_REQUEST',
      `\`classificationCeiling\` must be one of: ${CLASSIFICATIONS.join(', ')}.`,
    );
  }

  const kinds = body.kinds;
  if (kinds !== undefined) {
    if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > DOCUMENT_KINDS.length) {
      throw new ApiError('BAD_REQUEST', '`kinds` must be a non-empty array of document kinds.');
    }

    // An unknown kind is rejected rather than ignored: silently dropping it
    // would widen the search back to the whole corpus, which is the opposite
    // of what the caller asked for.
    const unknown = kinds.filter((kind) => !DOCUMENT_KINDS.includes(kind as DocumentKind));
    if (unknown.length > 0) {
      throw new ApiError(
        'BAD_REQUEST',
        `\`kinds\` must be one of: ${DOCUMENT_KINDS.join(', ')}.`,
      );
    }
  }

  return {
    query: query.trim(),
    limit: (limit as number | undefined) ?? 5,
    ...(ceiling === undefined ? {} : { classificationCeiling: ceiling as Classification }),
    ...(kinds === undefined ? {} : { kinds: kinds as DocumentKind[] }),
  };
}
