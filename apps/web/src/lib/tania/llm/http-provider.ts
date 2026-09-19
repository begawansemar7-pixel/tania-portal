import { TaniaError } from '@tania/config';
import { logger } from '@/lib/logger';
import type { LlmProvider, LlmRequest, LlmResult, LlmStreamChunk } from './provider';

export interface HttpLlmProviderOptions {
  /** Base URL of an OpenAI-compatible chat completions API. */
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface ChatCompletionChoice {
  message?: { content?: string };
  delta?: { content?: string };
  finish_reason?: string | null;
}

interface ChatCompletionBody {
  choices?: ChatCompletionChoice[];
}

/**
 * Adapter for any OpenAI-compatible chat completions endpoint.
 *
 * The endpoint, model, and key all come from configuration — no vendor is
 * named in business logic, and nothing is assumed about which gateway DPS
 * eventually uses. Selected only when both a base URL and a key are present.
 */
export class HttpLlmProvider implements LlmProvider {
  readonly id = 'http';
  readonly supportsStreaming = true;

  constructor(private readonly options: HttpLlmProviderOptions) {}

  get model(): string {
    return this.options.model;
  }

  private payload(request: LlmRequest, stream: boolean) {
    return {
      model: this.options.model,
      stream,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      // `LlmMessage.role` already uses the system/user/assistant vocabulary.
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    };
  }

  private async call(request: LlmRequest, stream: boolean): Promise<Response> {
    const url = new URL('chat/completions', ensureTrailingSlash(this.options.baseUrl));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(this.payload(request, stream)),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (cause) {
      logger.error('llm.unreachable', { provider: this.id, model: this.options.model });
      throw TaniaError.upstreamUnavailable('Penyedia model tidak dapat dihubungi.', { cause });
    }

    if (!response.ok) {
      logger.error('llm.rejected', { provider: this.id, status: response.status });
      throw TaniaError.upstreamUnavailable(
        `Penyedia model menolak permintaan (status ${response.status}).`,
      );
    }

    return response;
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    const response = await this.call(request, false);
    const body = (await response.json()) as ChatCompletionBody;
    const text = body.choices?.[0]?.message?.content ?? '';

    if (text.length === 0) {
      throw TaniaError.upstreamUnavailable('Penyedia model mengembalikan jawaban kosong.');
    }

    return { text, model: this.options.model, suggestions: [] };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const response = await this.call(request, true);
    const body = response.body;

    if (!body) {
      const result = await this.complete(request);
      yield { text: result.text, done: true };
      return;
    }

    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { text: '', done: true };
          return;
        }

        try {
          const chunk = JSON.parse(payload) as ChatCompletionBody;
          const text = chunk.choices?.[0]?.delta?.content ?? '';
          if (text.length > 0) yield { text };
        } catch {
          // A partial frame; the next read completes it.
        }
      }
    }

    yield { text: '', done: true };
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
