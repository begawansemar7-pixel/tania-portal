import type { RiskLevel } from './risk.js';
import type { TraceStatus } from './trace.js';

/**
 * A tool as published by a runtime and classified by governance.
 *
 * This is the only description of a capability that TANIA may plan against:
 * a tool absent from the manifest cannot be planned and cannot be executed.
 */
export interface ToolManifestEntry {
  toolId: string;
  name: string;
  description: string;
  /** Plain-language side effect, shown to a human in an approval gate. */
  effect: string;
  /** Whether the runtime can compensate for this action afterwards. */
  reversible: boolean;
  /** Risk proposed by the runtime; governance may raise it, never lower it silently. */
  defaultRisk: RiskLevel;
  requiredScopes: string[];
  /** JSON-Schema-like parameter description. */
  parameters?: Record<string, unknown>;
}

export interface ToolUsage {
  toolId: string;
  name: string;
  risk: RiskLevel;
  status: TraceStatus;
  summary: string;
}

export interface ToolExecutionRequest {
  toolId: string;
  input: Record<string, unknown>;
  correlationId: string;
}

export interface ToolExecutionResult {
  status: 'SUCCEEDED' | 'FAILED';
  summary: string;
  durationMs: number;
  output?: Record<string, unknown>;
  error?: string;
  /** Identifier of a compensating action, when the runtime recorded one. */
  compensationId?: string;
}
