import type {
  ChatStreamEvent,
  ChatStreamPhase,
  TaniaChatRequest,
  TaniaChatResponse,
} from '@tania/types';
import type { StoredConversation } from '@/lib/tania/transcript/store';

export interface ChatFailure {
  code: string;
  message: string;
  requestId?: string;
}

export class TaniaChatError extends Error {
  constructor(readonly failure: ChatFailure) {
    super(failure.message);
    this.name = 'TaniaChatError';
  }
}

export interface ChatStreamHandlers {
  onAccepted?: (conversationId: string) => void;
  onPhase?: (phase: ChatStreamPhase) => void;
  onIntent?: (intent: TaniaChatResponse['intent']) => void;
  onSources?: (sources: TaniaChatResponse['sources']) => void;
  onDelta?: (text: string) => void;
}

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string };
  requestId?: string;
}

/**
 * Browser-side client for the conversational API.
 *
 * Streaming uses `fetch` rather than `EventSource` because the turn is a POST:
 * the question, the conversation id, and the screen context all travel in the
 * body. The parser below is the minimum needed for named SSE events.
 */
export class TaniaChatClient {
  constructor(private readonly basePath = '/api/tania') {}

  async newConversation(): Promise<string> {
    const { conversationId } = await this.json<{ conversationId: string }>(
      `${this.basePath}/conversations`,
      { method: 'POST' },
    );
    return conversationId;
  }

  async loadConversation(conversationId: string): Promise<StoredConversation> {
    return this.json<StoredConversation>(
      `${this.basePath}/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'GET' },
    );
  }

  /** Single-response turn, for clients that do not want partial output. */
  async chat(request: TaniaChatRequest, signal?: AbortSignal): Promise<TaniaChatResponse> {
    return this.json<TaniaChatResponse>(`${this.basePath}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
      ...(signal ? { signal } : {}),
    });
  }

  /**
   * Streamed turn. Resolves with the same response the JSON form returns, so a
   * caller can use either without branching on the result shape.
   */
  async streamChat(
    request: TaniaChatRequest,
    handlers: ChatStreamHandlers = {},
    signal?: AbortSignal,
  ): Promise<TaniaChatResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.basePath}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ ...request, stream: true }),
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      throw new TaniaChatError({
        code: 'NETWORK',
        message:
          cause instanceof DOMException && cause.name === 'AbortError'
            ? 'Permintaan dibatalkan.'
            : 'Tidak dapat menghubungi TANIA. Periksa koneksi Anda.',
      });
    }

    if (!response.ok || !response.body) {
      throw await this.toFailure(response);
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let result: TaniaChatResponse | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const event = parseSseFrame(frame);
        if (!event) continue;

        switch (event.type) {
          case 'accepted':
            handlers.onAccepted?.(event.conversationId);
            break;
          case 'phase':
            handlers.onPhase?.(event.phase);
            break;
          case 'intent':
            handlers.onIntent?.(event.intent);
            break;
          case 'sources':
            handlers.onSources?.(event.sources);
            break;
          case 'delta':
            handlers.onDelta?.(event.text);
            break;
          case 'done':
            result = event.response;
            break;
          case 'error':
            throw new TaniaChatError({ code: event.code, message: event.message });
        }
      }
    }

    if (!result) {
      throw new TaniaChatError({
        code: 'INCOMPLETE',
        message: 'Aliran jawaban berakhir sebelum selesai. Coba lagi.',
      });
    }

    return result;
  }

  private async json<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch {
      throw new TaniaChatError({
        code: 'NETWORK',
        message: 'Tidak dapat menghubungi TANIA. Periksa koneksi Anda.',
      });
    }

    if (!response.ok) throw await this.toFailure(response);

    const payload = (await response.json()) as Envelope<T>;
    if (!payload.data) {
      throw new TaniaChatError({ code: 'INCOMPLETE', message: 'Respons TANIA tidak lengkap.' });
    }
    return payload.data;
  }

  private async toFailure(response: Response): Promise<TaniaChatError> {
    const payload = (await response.json().catch(() => ({}))) as Envelope<unknown>;

    return new TaniaChatError({
      code: payload.error?.code ?? `HTTP_${response.status}`,
      message: payload.error?.message ?? 'TANIA tidak dapat menyelesaikan permintaan ini.',
      ...(payload.requestId === undefined ? {} : { requestId: payload.requestId }),
    });
  }
}

/** Parses one `event:`/`data:` frame. Exported for tests. */
export function parseSseFrame(frame: string): ChatStreamEvent | null {
  const dataLine = frame
    .split('\n')
    .find((line) => line.startsWith('data:'));

  if (!dataLine) return null;

  try {
    return JSON.parse(dataLine.slice(5).trim()) as ChatStreamEvent;
  } catch {
    return null;
  }
}

/** User-facing labels for pipeline phases. */
export const PHASE_LABEL: Record<ChatStreamPhase, string> = {
  UNDERSTANDING: 'Memahami permintaan',
  RETRIEVING: 'Menelusuri pengetahuan',
  PLANNING: 'Menyusun rencana',
  EXECUTING: 'Menjalankan tool',
  COMPOSING: 'Menyusun jawaban',
  VERIFYING: 'Memverifikasi bukti',
};
