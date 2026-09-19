/**
 * Runtime domain — the boundary to JARVIS.
 *
 * The constraint that shapes this file: **JARVIS is not reimplemented here.**
 * TANIA decides *what* should happen and whether it is allowed; JARVIS decides
 * *how* and does it. So the port is deliberately thin — one structured command
 * in, one structured result out — and carries no execution logic of its own.
 *
 * A capability TANIA cannot reach is a first-class answer (`UNSUPPORTED`),
 * never a thrown surprise: the orchestrator has to be able to plan around a
 * runtime that does less than the full contract.
 */
import type {
  JarvisCapability,
  JarvisCapabilityStatus,
  JarvisCommand,
  JarvisResult,
} from '@tania/types';

/** Per-call controls the caller owns: budget, retries, and cancellation. */
export interface JarvisDispatchOptions {
  /** Overrides the command's own budget. */
  timeoutMs?: number;
  /** Attempts including the first. Only retryable failures are retried. */
  maxAttempts?: number;
  /** Cancels an in-flight command; the result comes back `CANCELLED`. */
  signal?: AbortSignal;
}

/**
 * One capability's implementation.
 *
 * Splitting per capability is what lets a deployment mix real and simulated:
 * `files` can be live while `computer` is still a mock, and `describe()` says
 * so honestly instead of the portal guessing.
 */
export interface JarvisCapabilityAdapter {
  readonly id: string;
  readonly capability: JarvisCapability;
  /** False when this adapter simulates rather than reaches a real runtime. */
  readonly live: boolean;
  /**
   * Runs one command.
   *
   * Implementations do not apply timeout or retry — the runtime adapter owns
   * those, so every capability behaves the same way under failure.
   */
  handle(command: JarvisCommand, signal?: AbortSignal): Promise<JarvisResult>;
  describe?(): string;
}

/**
 * The single door from TANIA to JARVIS.
 *
 * Everything crossing it is a `JarvisCommand`; everything coming back is a
 * `JarvisResult`. No caller holds a capability adapter directly, so timeout,
 * retry, cancellation and failure reporting cannot be skipped by accident.
 */
export interface JarvisRuntimeAdapter {
  readonly id: string;
  capabilities(): JarvisCapability[];
  supports(capability: JarvisCapability): boolean;
  /** Per-capability truth about what is live and what is simulated. */
  describe(): JarvisCapabilityStatus[];
  dispatch(command: JarvisCommand, options?: JarvisDispatchOptions): Promise<JarvisResult>;
}
