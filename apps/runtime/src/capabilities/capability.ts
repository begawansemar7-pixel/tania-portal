import type { JarvisCapability, JarvisCommand, JarvisResult } from '@tania/types';

/**
 * One capability's implementation.
 *
 * Handlers return a `JarvisResult` and never throw: a capability that throws
 * would leave the command with no status at all, and the caller cannot tell an
 * absent answer from a refused one.
 */
export interface RuntimeCapability {
  readonly capability: JarvisCapability;
  /** Actions this capability understands, for the manifest and for refusals. */
  readonly actions: readonly string[];
  handle(command: JarvisCommand, signal?: AbortSignal): Promise<JarvisResult>;
}

export function ok(
  command: JarvisCommand,
  partial: Omit<Partial<JarvisResult>, 'status'> & { summary: string },
): JarvisResult {
  return {
    ...partial,
    // After the spread, so a caller cannot hand back a success that is not one.
    status: 'SUCCEEDED',
    evidence: partial.evidence ?? [],
    artifacts: partial.artifacts ?? [],
    // Overwritten by the dispatcher, the only place that sees the clock.
    executionTime: partial.executionTime ?? 0,
    requestId: command.requestId,
  };
}

export function failed(
  command: JarvisCommand,
  error: { code: string; message: string; retryable: boolean },
): JarvisResult {
  return {
    status: 'FAILED',
    evidence: [],
    artifacts: [],
    executionTime: 0,
    requestId: command.requestId,
    error,
  };
}

/**
 * The honest answer for work this runtime cannot do.
 *
 * `UNSUPPORTED` exists in the contract precisely so a deployment can say "not
 * here" instead of simulating a success. A runtime that pretended to drive a
 * browser would produce a trace claiming something happened that did not.
 */
export function unsupported(command: JarvisCommand, reason: string): JarvisResult {
  return {
    status: 'UNSUPPORTED',
    evidence: [],
    artifacts: [],
    executionTime: 0,
    requestId: command.requestId,
    error: { code: 'CAPABILITY_UNSUPPORTED', message: reason, retryable: false },
  };
}

/** An action the capability does not model. Never guessed at. */
export function unknownAction(command: JarvisCommand): JarvisResult {
  return {
    status: 'UNSUPPORTED',
    evidence: [],
    artifacts: [],
    executionTime: 0,
    requestId: command.requestId,
    error: {
      code: 'ACTION_UNKNOWN',
      message: `Aksi "${command.action}" tidak dikenali oleh kapabilitas ${command.capability}.`,
      retryable: false,
    },
  };
}
