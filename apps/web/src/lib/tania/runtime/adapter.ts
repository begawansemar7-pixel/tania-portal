import { logger } from '@/lib/logger';
import type {
  JarvisCapability,
  JarvisCapabilityAdapter,
  JarvisCapabilityStatus,
  JarvisCommand,
  JarvisDispatchOptions,
  JarvisResult,
  JarvisRuntimeAdapter,
} from './capabilities/types';
import { failed } from './commands';

export interface RuntimeAdapterOptions {
  adapters: JarvisCapabilityAdapter[];
  id?: string;
  /** Applied when neither the command nor the call names a budget. */
  defaultTimeoutMs?: number;
  /** Attempts including the first. */
  maxAttempts?: number;
  backoffMs?: number;
  /** Injected so retry backoff is instant under test. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 250;

/**
 * The single door from TANIA to JARVIS.
 *
 * Routing is per capability, so a deployment can run some capabilities live and
 * others simulated. Four behaviours are owned here rather than by each adapter,
 * because "every capability fails the same way" is the property that makes the
 * orchestrator's recovery logic trustworthy:
 *
 * - **Timeout** — a command that outlives its budget returns `TIMEOUT`, and the
 *   underlying call is aborted rather than left running.
 * - **Retry** — only a failure the runtime itself marked `retryable`, and only
 *   while attempts remain. A rejected or unsupported command is never retried.
 * - **Cancellation** — an aborted call returns `CANCELLED`; nothing is retried
 *   after the caller has walked away.
 * - **Failure handling** — nothing thrown escapes. A caller always receives a
 *   `JarvisResult`, because a task that cannot read the outcome cannot report
 *   or compensate it.
 */
export class CapabilityRoutingAdapter implements JarvisRuntimeAdapter {
  readonly id: string;

  private readonly byCapability: Map<JarvisCapability, JarvisCapabilityAdapter>;

  constructor(private readonly options: RuntimeAdapterOptions) {
    this.id = options.id ?? 'jarvis';
    this.byCapability = new Map(
      options.adapters.map((adapter) => [adapter.capability, adapter] as const),
    );
  }

  capabilities(): JarvisCapability[] {
    return [...this.byCapability.keys()];
  }

  supports(capability: JarvisCapability): boolean {
    return this.byCapability.has(capability);
  }

  describe(): JarvisCapabilityStatus[] {
    return [...this.byCapability.values()].map((adapter) => ({
      capability: adapter.capability,
      live: adapter.live,
      adapter: adapter.id,
      ...(adapter.describe === undefined ? {} : { detail: adapter.describe() }),
    }));
  }

  async dispatch(command: JarvisCommand, options: JarvisDispatchOptions = {}): Promise<JarvisResult> {
    const now = this.options.now ?? (() => Date.now());
    const startedAt = now();

    const finish = (result: JarvisResult, attempts: number): JarvisResult => ({
      ...result,
      executionTime: Math.max(0, now() - startedAt),
      requestId: command.requestId,
      attempts,
    });

    const adapter = this.byCapability.get(command.capability);
    if (!adapter) {
      return finish(
        failed(
          command,
          {
            code: 'CAPABILITY_UNAVAILABLE',
            message: `Runtime tidak menyediakan kapabilitas ${command.capability}.`,
            retryable: false,
          },
          'UNSUPPORTED',
        ),
        0,
      );
    }

    // The last line of defence. A command that says it needs a human decision
    // but carries none must not reach the runtime, whatever the caller believes
    // it already checked.
    if (command.requiresApproval && !command.approvalId) {
      logger.warn('runtime.command_rejected', {
        requestId: command.requestId,
        capability: command.capability,
        action: command.action,
        risk: command.risk,
        reason: 'missing approval',
      });

      return finish(
        failed(
          command,
          {
            code: 'APPROVAL_REQUIRED',
            message: 'Perintah ini memerlukan persetujuan manusia yang tercatat.',
            retryable: false,
          },
          'REJECTED',
        ),
        0,
      );
    }

    const maxAttempts = Math.max(1, options.maxAttempts ?? this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const timeoutMs =
      options.timeoutMs ?? command.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const backoff = this.options.backoffMs ?? DEFAULT_BACKOFF_MS;

    let attempt = 0;
    let last: JarvisResult | undefined;

    while (attempt < maxAttempts) {
      attempt += 1;

      if (options.signal?.aborted) {
        return finish(cancelled(command), attempt - 1);
      }

      const result = await this.attempt(adapter, command, timeoutMs, options.signal);
      last = result;

      if (result.status === 'SUCCEEDED') {
        logger.info('runtime.command_succeeded', {
          requestId: command.requestId,
          adapter: adapter.id,
          capability: command.capability,
          action: command.action,
          attempt,
        });
        return finish(result, attempt);
      }

      const retryable = result.status === 'TIMEOUT' || result.error?.retryable === true;
      if (!retryable || attempt >= maxAttempts || options.signal?.aborted) break;

      logger.warn('runtime.command_retry', {
        requestId: command.requestId,
        adapter: adapter.id,
        capability: command.capability,
        action: command.action,
        attempt,
        status: result.status,
      });

      await sleep(backoff * attempt);
    }

    const result = last ?? failed(command, {
      code: 'NO_RESULT',
      message: 'Runtime tidak mengembalikan hasil.',
      retryable: false,
    });

    logger.warn('runtime.command_failed', {
      requestId: command.requestId,
      adapter: adapter.id,
      capability: command.capability,
      action: command.action,
      status: result.status,
      code: result.error?.code,
      attempts: attempt,
    });

    return finish(result, attempt);
  }

  /** One attempt, bounded by the budget and by the caller's cancellation. */
  private async attempt(
    adapter: JarvisCapabilityAdapter,
    command: JarvisCommand,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<JarvisResult> {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<JarvisResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(
          failed(
            command,
            {
              code: 'TIMEOUT',
              message: `Runtime tidak merespons dalam ${timeoutMs} ms.`,
              retryable: true,
            },
            'TIMEOUT',
          ),
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        adapter.handle(command, controller.signal).catch((error: unknown) =>
          // A throwing adapter is a bug in that adapter, not a reason for the
          // caller to lose the outcome of the whole task.
          failed(command, {
            code: 'ADAPTER_ERROR',
            message: describe(error),
            retryable: true,
          }),
        ),
        expiry,
      ]);

      // Cancellation wins over whatever the adapter managed to return.
      return signal?.aborted && result.status !== 'SUCCEEDED' ? cancelled(command) : result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

function cancelled(command: JarvisCommand): JarvisResult {
  return failed(
    command,
    { code: 'CANCELLED', message: 'Perintah dibatalkan pemanggil.', retryable: false },
    'CANCELLED',
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Kesalahan tidak terduga pada adapter runtime.';
}
