import { randomUUID } from 'node:crypto';
import type {
  JarvisArtifact,
  JarvisCapability,
  JarvisCommand,
  JarvisError,
  JarvisResult,
  JarvisStatus,
  RiskLevel,
} from '@tania/types';

/**
 * Builders for the structured command envelope.
 *
 * Commands are assembled here and nowhere else, so every call into JARVIS
 * carries the same fields — including `risk` and `requiresApproval`, which the
 * runtime needs in order to be able to refuse.
 */
export interface CommandContext {
  correlationId?: string;
  sessionId?: string;
  taskId?: string;
  actorId?: string;
  approvalId?: string;
  timeoutMs?: number;
}

export function buildCommand(
  input: {
    capability: JarvisCapability;
    action: string;
    task: string;
    parameters?: Record<string, unknown>;
    risk: RiskLevel;
    requiresApproval?: boolean;
    requestId?: string;
  },
  context: CommandContext = {},
): JarvisCommand {
  return {
    requestId: input.requestId ?? randomUUID(),
    capability: input.capability,
    action: input.action,
    task: input.task,
    parameters: input.parameters ?? {},
    risk: input.risk,
    requiresApproval: input.requiresApproval ?? false,
    ...(context.approvalId === undefined ? {} : { approvalId: context.approvalId }),
    ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
    ...(context.taskId === undefined ? {} : { taskId: context.taskId }),
    ...(context.actorId === undefined ? {} : { actorId: context.actorId }),
    ...(context.timeoutMs === undefined ? {} : { timeoutMs: context.timeoutMs }),
  };
}

/** A successful result. Callers fill `executionTime`; the adapter measures it. */
export function succeeded(
  command: JarvisCommand,
  input: {
    summary: string;
    output?: Record<string, unknown>;
    artifacts?: JarvisArtifact[];
    evidence?: JarvisResult['evidence'];
  },
): JarvisResult {
  return {
    status: 'SUCCEEDED',
    evidence: input.evidence ?? [],
    artifacts: input.artifacts ?? [],
    executionTime: 0,
    summary: input.summary,
    ...(input.output === undefined ? {} : { output: input.output }),
    requestId: command.requestId,
  };
}

export function failed(
  command: JarvisCommand,
  error: JarvisError,
  status: JarvisStatus = 'FAILED',
): JarvisResult {
  return {
    status,
    evidence: [],
    artifacts: [],
    executionTime: 0,
    error,
    summary: error.message,
    requestId: command.requestId,
  };
}

/** The answer when a runtime genuinely cannot do something. */
export function unsupported(command: JarvisCommand, detail: string): JarvisResult {
  return failed(
    command,
    { code: 'CAPABILITY_UNAVAILABLE', message: detail, retryable: false },
    'UNSUPPORTED',
  );
}

/** Stable artifact ids, so the same command produces the same trace twice. */
export function artifactId(command: JarvisCommand, suffix: string): string {
  return `${command.requestId}:${suffix}`;
}
