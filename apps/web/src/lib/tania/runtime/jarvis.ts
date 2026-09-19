import { requiresHumanApproval } from '@tania/types';
import { config, type TaniaConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';
import type { ToolDefinition } from '@/lib/tania/tools/registry';
import type {
  Evidence,
  JarvisArtifact,
  JarvisCapability,
  JarvisCapabilityAdapter,
  JarvisCapabilityStatus,
  JarvisDispatchOptions,
  JarvisResult,
  JarvisRuntimeAdapter,
} from './capabilities/types';
import { CapabilityRoutingAdapter } from './adapter';
import { createMockCapabilityAdapters } from './capabilities/mock';
import { HttpCapabilityAdapter } from './capabilities/http';
import { buildCommand, type CommandContext } from './commands';

export interface ToolExecutionRequest {
  tool: ToolDefinition;
  input: Record<string, unknown>;
  actor: Actor;
  correlationId: string;
  /**
   * Whether policy says this call needs a human decision.
   *
   * Set by the governance layer, which knows the configured threshold. When a
   * caller omits it, the runtime falls back to the constitutional rule that
   * L3 and L4 always need one.
   */
  requiresApproval?: boolean;
  /** Recorded human decision, when the tool needs one. */
  approvalId?: string;
  /** Cancels an in-flight call. */
  signal?: AbortSignal;
  sessionId?: string;
  taskId?: string;
}

export interface ToolExecutionResult {
  status: 'SUCCEEDED' | 'FAILED';
  summary: string;
  durationMs: number;
  output?: Record<string, unknown>;
  error?: string;
  /** Files, screenshots or clips the runtime produced. */
  artifacts?: JarvisArtifact[];
  /** Sources the runtime can cite for what it did. */
  evidence?: Evidence[];
}

/**
 * JARVIS is the execution/runtime layer. TANIA never talks to enterprise
 * systems directly — it goes through this adapter.
 *
 * Two doors, one runtime. `execute`/`compensate` are the tool-shaped path the
 * Brain, the agents and the orchestrator already use; `adapter` is the general
 * structured-command path that reaches every capability. Both end up as a
 * `JarvisCommand`, so a single place applies timeout, retry and cancellation.
 */
export interface JarvisRuntime {
  readonly id: string;
  /** The structured-command door into the runtime. */
  readonly adapter: JarvisRuntimeAdapter;
  /** Capabilities this runtime can serve. */
  capabilities(): JarvisCapability[];
  /** Which capabilities are live and which are simulated. */
  describe(): JarvisCapabilityStatus[];
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
  /**
   * Undoes a completed call.
   *
   * Optional because not every runtime can: an adapter that omits it declares
   * that its actions are one-way, and the orchestrator will not promise a
   * rollback it cannot deliver.
   */
  compensate?(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
}

/**
 * Runs tool calls as structured JARVIS commands.
 *
 * The mapping is deliberately thin: a registered tool becomes a `tools.invoke`
 * command carrying the tool's own declared identity, risk and effect. TANIA
 * does not describe *how* the tool works — that is JARVIS's business, and
 * restating it here would be the duplication the constitution forbids.
 */
export class AdapterBackedJarvisRuntime implements JarvisRuntime {
  constructor(
    readonly adapter: JarvisRuntimeAdapter,
    private readonly options: { dispatch?: JarvisDispatchOptions } = {},
  ) {}

  get id(): string {
    return this.adapter.id;
  }

  capabilities(): JarvisCapability[] {
    return this.adapter.capabilities();
  }

  describe(): JarvisCapabilityStatus[] {
    return this.adapter.describe();
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    return this.run(request, 'tools.invoke');
  }

  async compensate(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    return this.run(request, 'tools.compensate');
  }

  private async run(
    request: ToolExecutionRequest,
    action: 'tools.invoke' | 'tools.compensate',
  ): Promise<ToolExecutionResult> {
    const { tool } = request;

    const command = buildCommand(
      {
        capability: 'tools',
        action,
        task:
          action === 'tools.invoke'
            ? `Menjalankan ${tool.name}`
            : `Membatalkan ${tool.name}`,
        parameters: {
          toolId: tool.id,
          toolName: tool.name,
          effect: tool.effect,
          reversible: tool.reversible,
          input: request.input,
        },
        risk: tool.risk,
        // L3/L4 work carries its flag all the way down, so the runtime can
        // refuse a command whose approval never happened. Compensation undoes
        // something a human already approved; gating it again would leave the
        // enterprise half-changed while it waited.
        requiresApproval:
          action === 'tools.invoke' &&
          (request.requiresApproval ?? requiresHumanApproval(tool.risk)),
      },
      context(request),
    );

    const result = await this.adapter.dispatch(
      command,
      request.signal === undefined
        ? (this.options.dispatch ?? {})
        : { ...this.options.dispatch, signal: request.signal },
    );

    return toToolResult(result, tool);
  }
}

function context(request: ToolExecutionRequest): CommandContext {
  return {
    correlationId: request.correlationId,
    actorId: request.actor.id,
    ...(request.approvalId === undefined ? {} : { approvalId: request.approvalId }),
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    ...(request.taskId === undefined ? {} : { taskId: request.taskId }),
  };
}

/** Collapses the runtime's six statuses into the two the tool path models. */
export function toToolResult(result: JarvisResult, tool: ToolDefinition): ToolExecutionResult {
  const summary = result.summary ?? result.error?.message ?? `${tool.name} tidak memberi ringkasan.`;

  return {
    status: result.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
    summary,
    durationMs: Math.max(1, result.executionTime),
    ...(result.output === undefined ? {} : { output: result.output }),
    ...(result.error === undefined ? {} : { error: result.error.code }),
    ...(result.artifacts.length === 0 ? {} : { artifacts: result.artifacts }),
    ...(result.evidence.length === 0 ? {} : { evidence: result.evidence }),
  };
}

/**
 * Simulated runtime used until a JARVIS endpoint is configured.
 *
 * Kept as a named class because tests and the composition root construct it
 * directly; it is now a thin assembly of the simulated capability adapters
 * rather than a separate implementation of the tool path.
 */
export class MockJarvisRuntime extends AdapterBackedJarvisRuntime {
  constructor(adapters: JarvisCapabilityAdapter[] = createMockCapabilityAdapters()) {
    super(new CapabilityRoutingAdapter({ id: 'mock', adapters }));
  }
}

/**
 * Builds the capability set for a deployment.
 *
 * A capability is live only where a runtime is actually configured for it;
 * everything else falls back to the simulated adapter, and `describe()` reports
 * which is which. No capability is silently dropped.
 */
export function createCapabilityAdapters(cfg: TaniaConfig = config): JarvisCapabilityAdapter[] {
  const mocks = createMockCapabilityAdapters();
  if (cfg.runtime.adapter !== 'jarvis' || !cfg.runtime.baseUrl) return mocks;

  const baseUrl = cfg.runtime.baseUrl;
  const declared = cfg.runtime.capabilities;

  // A capability the deployment did not declare stays simulated. Routing it to
  // JARVIS anyway would report it as live while every call returned 404.
  return mocks.map((mock) =>
    declared === undefined || declared.includes(mock.capability)
      ? new HttpCapabilityAdapter({ capability: mock.capability, baseUrl })
      : mock,
  );
}

export function createJarvisAdapter(cfg: TaniaConfig = config): JarvisRuntimeAdapter {
  if (cfg.runtime.adapter === 'jarvis' && !cfg.runtime.baseUrl) {
    logger.warn('runtime.jarvis_not_configured', {
      reason: 'JARVIS_BASE_URL is not set; falling back to the simulated runtime.',
    });
  }

  const live = cfg.runtime.adapter === 'jarvis' && Boolean(cfg.runtime.baseUrl);

  return new CapabilityRoutingAdapter({
    id: live ? 'jarvis' : 'mock',
    adapters: createCapabilityAdapters(cfg),
  });
}

export function createJarvisRuntime(cfg: TaniaConfig = config): JarvisRuntime {
  return new AdapterBackedJarvisRuntime(createJarvisAdapter(cfg));
}
