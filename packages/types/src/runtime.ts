/**
 * JARVIS runtime contract.
 *
 * JARVIS is the execution layer; TANIA is the intelligence layer. This file is
 * the whole boundary between them: a structured command in, a structured result
 * out. Nothing here describes *how* JARVIS works, because TANIA must not know
 * and must not duplicate it.
 *
 * The shapes are a contract TANIA speaks, not a discovered API. A deployment
 * points `JARVIS_BASE_URL` at something that honours them, or runs the
 * simulated adapter.
 */
import type { Evidence } from './evidence.js';
import type { RiskLevel } from './risk.js';

/**
 * What a runtime can be asked to do.
 *
 * Fixed and explicit: an adapter declares which of these it genuinely serves,
 * so "unsupported" is an answer TANIA can act on rather than a surprise.
 */
export const JARVIS_CAPABILITIES = [
  'voice.input',
  'voice.output',
  'vision',
  'browser',
  'computer',
  'files',
  'tools',
  'skills',
  'session',
  'verification',
] as const;

export type JarvisCapability = (typeof JARVIS_CAPABILITIES)[number];

export function isJarvisCapability(value: unknown): value is JarvisCapability {
  return (JARVIS_CAPABILITIES as readonly unknown[]).includes(value);
}

/** Human-readable names, for settings screens and operator logs. */
export const JARVIS_CAPABILITY_LABELS: Record<JarvisCapability, string> = {
  'voice.input': 'Voice Input',
  'voice.output': 'Voice Output',
  vision: 'Vision',
  browser: 'Browser',
  computer: 'Computer Control',
  files: 'Files',
  tools: 'Tools',
  skills: 'Skills',
  session: 'Session',
  verification: 'Verification',
};

/**
 * One instruction sent to the runtime.
 *
 * `risk` and `requiresApproval` travel with the command on purpose: the runtime
 * is the last place that can refuse, and it should never have to infer from the
 * action name whether a human agreed to this.
 */
export interface JarvisCommand {
  /** Idempotency key. A retry reuses it; a new attempt does not. */
  requestId: string;
  /** Capability namespace this command belongs to. */
  capability: JarvisCapability;
  /** What to do, e.g. `browser.open`, `files.read`, `tools.invoke`. */
  action: string;
  /** User-safe description of the work. Never chain-of-thought. */
  task: string;
  parameters: Record<string, unknown>;
  risk: RiskLevel;
  /** True when this command may only run because a human approved it. */
  requiresApproval: boolean;
  /** Recorded decision, when `requiresApproval` is true. */
  approvalId?: string;
  /** Ties runtime logs back to the originating request. */
  correlationId?: string;
  sessionId?: string;
  taskId?: string;
  /** Who the command is executed on behalf of. */
  actorId?: string;
  /** Wall-clock budget for this command. */
  timeoutMs?: number;
}

export const JARVIS_STATUSES = [
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
  'UNSUPPORTED',
  'REJECTED',
] as const;

export type JarvisStatus = (typeof JARVIS_STATUSES)[number];

/** Statuses that mean the runtime did not, and will not, do the work. */
export function isJarvisFailure(status: JarvisStatus): boolean {
  return status !== 'SUCCEEDED';
}

export interface JarvisError {
  code: string;
  /** User-safe message. Runtime internals do not belong here. */
  message: string;
  /** True when the same command could plausibly succeed on another attempt. */
  retryable: boolean;
}

/**
 * Something the runtime produced: a file, a screenshot, an audio clip.
 *
 * Content is referenced by `uri` rather than inlined, so a large artifact never
 * has to travel through the portal to be recorded in a trace.
 */
export interface JarvisArtifact {
  id: string;
  kind: 'file' | 'image' | 'audio' | 'video' | 'text' | 'data';
  name: string;
  mediaType: string;
  uri?: string;
  /** Inline content, for small text results. */
  text?: string;
  sizeBytes?: number;
}

/** What the runtime reports back. The whole of it. */
export interface JarvisResult {
  status: JarvisStatus;
  /** Sources the runtime can cite for what it did or found. */
  evidence: Evidence[];
  artifacts: JarvisArtifact[];
  /** Milliseconds spent, as measured by the caller. */
  executionTime: number;
  error?: JarvisError;
  /** User-safe account of what happened. */
  summary?: string;
  /** Free-form result payload for capability-specific data. */
  output?: Record<string, unknown>;
  /** Echoes the command, so a result is traceable on its own. */
  requestId?: string;
  /** Attempts made, including the first. */
  attempts?: number;
}

/** What an adapter reports about itself, for Settings and health checks. */
export interface JarvisCapabilityStatus {
  capability: JarvisCapability;
  /** False when a simulated adapter stands in for a real runtime. */
  live: boolean;
  adapter: string;
  detail?: string;
}
