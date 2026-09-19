import type { Actor } from '@/lib/identity/types';
import { TaniaApiError, type TaniaApiClient } from '@/lib/tania/api/client';
import type { StoredConversation, TranscriptStore, TranscriptTurn } from './store';

interface SessionResource {
  id: string;
  title: string | null;
  messages?: Array<{
    id: string;
    role: 'USER' | 'TANIA';
    content: string;
    createdAt: string;
    intent: string | null;
  }>;
}

/** Persists conversations in PostgreSQL through the TANIA backend. */
export class HttpTranscriptStore implements TranscriptStore {
  readonly id = 'backend';
  readonly durable = true;

  constructor(private readonly client: TaniaApiClient) {}

  async ensureSession(conversationId: string, actor: Actor): Promise<void> {
    // Creating with a client-supplied id is idempotent on the backend.
    await this.client.request('POST', '/v1/sessions', actor, {
      id: conversationId,
      channel: 'portal',
    });
  }

  async recordTurn(conversationId: string, turn: TranscriptTurn, actor: Actor): Promise<void> {
    const { response } = turn;

    await this.client.request(
      'POST',
      `/v1/sessions/${encodeURIComponent(conversationId)}/turns`,
      actor,
      {
        messageId: turn.messageId,
        question: turn.question,
        answer: response.answer,
        intent: response.intent,
        risk: response.risk,
        evidence: response.evidence,
        trace: response.trace,
        tools: response.toolsUsed.map((tool) => ({
          toolId: tool.toolId,
          name: tool.name,
          status: tool.status,
          risk: tool.risk,
          summary: tool.summary,
        })),
      },
    );
  }

  async loadConversation(conversationId: string, actor: Actor): Promise<StoredConversation> {
    try {
      const session = await this.client.request<SessionResource>(
        'GET',
        `/v1/sessions/${encodeURIComponent(conversationId)}`,
        actor,
      );

      return {
        conversationId,
        ...(session.title === null ? {} : { title: session.title }),
        messages: (session.messages ?? []).map((message) => ({
          id: message.id,
          role: message.role === 'USER' ? ('user' as const) : ('tania' as const),
          content: message.content,
          createdAt: message.createdAt,
          ...(message.intent === null ? {} : { intent: message.intent }),
        })),
      };
    } catch (error) {
      // An unknown conversation is an empty one, not a failure.
      if (error instanceof TaniaApiError && (error.status === 404 || error.status === 403)) {
        return { conversationId, messages: [] };
      }
      throw error;
    }
  }
}
