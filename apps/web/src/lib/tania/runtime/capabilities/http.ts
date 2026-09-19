import type {
  JarvisCapability,
  JarvisCapabilityAdapter,
  JarvisCommand,
  JarvisResult,
} from './types';
import { failed } from '../commands';

export interface HttpCapabilityOptions {
  capability: JarvisCapability;
  baseUrl: string;
  /** Path the command is posted to, relative to the base URL. */
  path?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

const DEFAULT_PATH = '/v1/commands';

/**
 * Speaks the structured command envelope over HTTP.
 *
 * This is a **contract TANIA offers**, not an API discovered in a JARVIS
 * deployment: a runtime is integrated by exposing an endpoint that accepts a
 * `JarvisCommand` and answers with a `JarvisResult`. Nothing about JARVIS's own
 * internals is assumed, and no capability is reimplemented here — the adapter
 * only carries the envelope and reports what came back.
 *
 * Timeout, retry and cancellation are deliberately absent: `CapabilityRoutingAdapter`
 * owns them, so every capability fails identically.
 */
export class HttpCapabilityAdapter implements JarvisCapabilityAdapter {
  readonly live = true;
  readonly id: string;
  readonly capability: JarvisCapability;

  constructor(private readonly options: HttpCapabilityOptions) {
    this.capability = options.capability;
    this.id = `http.${options.capability}`;
  }

  describe(): string {
    return `Perintah dikirim ke ${this.endpoint()}.`;
  }

  async handle(command: JarvisCommand, signal?: AbortSignal): Promise<JarvisResult> {
    const call = this.options.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await call(this.endpoint(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.options.headers },
        body: JSON.stringify(command),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      // A transport failure may be transient, so the router is allowed to retry.
      return failed(command, {
        code: 'RUNTIME_UNREACHABLE',
        message: message(error),
        retryable: true,
      });
    }

    if (!response.ok) {
      return failed(command, {
        code: `RUNTIME_${response.status}`,
        message: `Runtime menolak perintah dengan status ${response.status}.`,
        // Only a server-side fault is worth trying again.
        retryable: response.status >= 500,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return failed(command, {
        code: 'RUNTIME_BAD_RESPONSE',
        message: 'Runtime mengembalikan respons yang bukan JSON.',
        retryable: false,
      });
    }

    return this.normalize(command, payload);
  }

  private endpoint(): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    return `${base}${this.options.path ?? DEFAULT_PATH}`;
  }

  /**
   * Trusts the envelope, not the runtime's goodwill.
   *
   * A malformed result is reported as a failure rather than passed through:
   * the trace downstream must not contain a status TANIA invented.
   */
  private normalize(command: JarvisCommand, payload: unknown): JarvisResult {
    const body = (payload as { data?: unknown }).data ?? payload;
    const result = body as Partial<JarvisResult>;

    if (typeof result?.status !== 'string') {
      return failed(command, {
        code: 'RUNTIME_BAD_RESPONSE',
        message: 'Respons runtime tidak memuat `status`.',
        retryable: false,
      });
    }

    return {
      status: result.status,
      evidence: Array.isArray(result.evidence) ? result.evidence : [],
      artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
      executionTime: typeof result.executionTime === 'number' ? result.executionTime : 0,
      ...(result.error === undefined ? {} : { error: result.error }),
      ...(result.summary === undefined ? {} : { summary: result.summary }),
      ...(result.output === undefined ? {} : { output: result.output }),
      requestId: command.requestId,
    };
  }
}

function message(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Perintah dibatalkan sebelum runtime menjawab.';
  }
  return error instanceof Error ? error.message : 'Runtime tidak dapat dihubungi.';
}
