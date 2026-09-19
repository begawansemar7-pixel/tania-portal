import { TaniaError } from '@tania/config';
import { logger } from '@/lib/logger';
import type { EmbeddingProvider } from '@tania/core/knowledge';

export interface HttpEmbeddingOptions {
  /** Base URL of an OpenAI-compatible embeddings API. */
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
}

interface EmbeddingsBody {
  data?: Array<{ embedding?: number[] }>;
}

/**
 * Adapter for any OpenAI-compatible embeddings endpoint.
 *
 * Endpoint, model, and key all come from configuration: no vendor is named in
 * retrieval logic, and nothing is assumed about which gateway DPS adopts.
 */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'http';

  constructor(private readonly options: HttpEmbeddingOptions) {}

  get model(): string {
    return this.options.model;
  }

  get dimensions(): number {
    return this.options.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = new URL('embeddings', ensureTrailingSlash(this.options.baseUrl));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({ model: this.options.model, input: texts }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (cause) {
      logger.error('embedding.unreachable', { provider: this.id, model: this.options.model });
      throw TaniaError.upstreamUnavailable('Penyedia embedding tidak dapat dihubungi.', { cause });
    }

    if (!response.ok) {
      throw TaniaError.upstreamUnavailable(
        `Penyedia embedding menolak permintaan (status ${response.status}).`,
      );
    }

    const body = (await response.json()) as EmbeddingsBody;
    const vectors = (body.data ?? []).map((entry) => entry.embedding ?? []);

    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
      throw TaniaError.upstreamUnavailable('Penyedia embedding mengembalikan vektor tidak lengkap.');
    }

    return vectors;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
