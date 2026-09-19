import type {
  ExecutionManager,
  ExecutionOutcome,
  TaskContext,
  TaskErrorLike,
  ToolRouter,
} from '@tania/core/orchestration';
import { randomUUID } from 'node:crypto';
import type {
  Evidence,
  JarvisArtifact,
  PlannedAction,
  TaskArtifact,
  ToolUsage,
  TraceStep,
} from '@tania/types';
import { logger } from '@/lib/logger';

export interface ExecutionManagerOptions {
  /** Attempts per action, including the first. */
  maxAttempts?: number;
  /** Injected so retry backoff is instant in tests. */
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 150;

/**
 * Runs the plan.
 *
 * Three behaviours matter more than the loop itself:
 *
 * - A **blocked** step is a governance outcome, not an error: it is recorded
 *   and the remaining steps still run.
 * - A **failed** step is retried, because runtimes fail transiently; when the
 *   attempts are spent the task stops.
 * - When the task stops after something already changed, the completed
 *   reversible steps are **compensated** — the difference between a task that
 *   half-happened and one that was undone.
 */
export class RetryingExecutionManager implements ExecutionManager {
  readonly id = 'retrying';

  constructor(
    private readonly toolRouter: ToolRouter,
    private readonly options: ExecutionManagerOptions = {},
  ) {}

  async run(actions: PlannedAction[], context: TaskContext): Promise<ExecutionOutcome> {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const backoff = this.options.backoffMs ?? DEFAULT_BACKOFF_MS;

    const tools: ToolUsage[] = [];
    const trace: TraceStep[] = [];
    const evidence: Evidence[] = [];
    const artifacts: TaskArtifact[] = [];
    const errors: TaskErrorLike[] = [];

    let pendingApprovalId: string | undefined;
    let status: ExecutionOutcome['status'] = 'SUCCEEDED';

    for (const action of actions) {
      if (action.status === 'BLOCKED') {
        trace.push(step(action, 'BLOCKED', action.detail ?? 'Diblokir kebijakan.'));
        continue;
      }

      const binding = this.toolRouter.bind(action, context);
      if (!binding) {
        action.status = 'BLOCKED';
        errors.push({
          code: 'TOOL_UNAVAILABLE',
          message: `Tool ${action.toolId} tidak dapat diikat ke eksekusi.`,
          actionId: action.id,
          recoverable: false,
        });
        trace.push(step(action, 'BLOCKED', 'Tool tidak tersedia untuk dieksekusi.'));
        continue;
      }

      action.status = 'RUNNING';
      let attempt = 0;
      let settled = false;

      while (attempt < maxAttempts && !settled) {
        attempt += 1;
        const startedAt = Date.now();
        const invocation = await binding.invoke({ question: context.question, attempt });

        action.attempts = attempt;
        const durationMs = Date.now() - startedAt;

        const collected = invocation.output?.evidence;
        if (Array.isArray(collected)) evidence.push(...(collected as Evidence[]));

        // An artifact outlives the step that made it, so it is lifted onto the
        // task rather than left buried in a tool result.
        const produced = invocation.output?.artifacts;
        if (Array.isArray(produced)) {
          artifacts.push(
            ...(produced as JarvisArtifact[]).map((item) => toTaskArtifact(item, action.toolId)),
          );
        }

        if (invocation.status === 'SUCCEEDED') {
          action.status = 'SUCCEEDED';
          action.detail = invocation.summary;
          tools.push(usage(invocation));
          trace.push(step(action, 'SUCCEEDED', invocation.summary, durationMs));
          settled = true;
          break;
        }

        if (invocation.status === 'AWAITING_APPROVAL') {
          action.status = 'AWAITING_APPROVAL';
          action.approvalId = invocation.approvalId;
          pendingApprovalId = invocation.approvalId;
          tools.push(usage(invocation));
          trace.push(step(action, 'AWAITING_APPROVAL', invocation.summary, durationMs));
          return {
            actions,
            tools,
            trace,
            evidence,
            artifacts,
            errors,
            status: 'AWAITING_APPROVAL',
            ...(pendingApprovalId === undefined ? {} : { pendingApprovalId }),
          };
        }

        if (invocation.status === 'BLOCKED') {
          action.status = 'BLOCKED';
          action.detail = invocation.summary;
          tools.push(usage(invocation));
          trace.push(step(action, 'BLOCKED', invocation.summary, durationMs));
          errors.push({
            code: 'POLICY_BLOCKED',
            message: invocation.summary,
            actionId: action.id,
            recoverable: false,
          });
          settled = true;
          break;
        }

        // FAILED: retry while attempts remain.
        const lastAttempt = attempt >= maxAttempts;
        trace.push(
          step(
            action,
            lastAttempt ? 'FAILED' : 'RUNNING',
            lastAttempt
              ? `${invocation.summary} (gagal setelah ${attempt} percobaan)`
              : `${invocation.summary} — mencoba ulang (${attempt}/${maxAttempts})`,
            durationMs,
          ),
        );

        if (lastAttempt) {
          action.status = 'FAILED';
          action.detail = invocation.summary;
          tools.push(usage(invocation));
          errors.push({
            code: 'TOOL_FAILED',
            message: invocation.summary,
            actionId: action.id,
            recoverable: true,
          });
          status = 'FAILED';
          settled = true;
        } else {
          logger.warn('task.step_retry', {
            taskId: context.taskId,
            actionId: action.id,
            toolId: action.toolId,
            attempt,
          });
          await sleep(backoff * attempt);
        }
      }

      if (status === 'FAILED') break;
    }

    if (status === 'FAILED') {
      // Something already ran; undo what can be undone before reporting.
      await this.compensate(actions, context);
      trace.push(...compensationTrace(actions));
    } else if (actions.every((action) => action.status === 'BLOCKED')) {
      status = 'BLOCKED';
    }

    return { actions, tools, trace, evidence, artifacts, errors, status };
  }

  async compensate(actions: PlannedAction[], context: TaskContext): Promise<PlannedAction[]> {
    const completed = actions
      .filter((action) => action.status === 'SUCCEEDED' && action.reversible)
      .reverse();

    for (const action of completed) {
      const binding = this.toolRouter.bind(action, context);
      if (!binding?.compensate) continue;

      const result = await binding.compensate();
      if (result.status === 'SUCCEEDED') {
        action.status = 'COMPENSATED';
        action.detail = result.summary;
        logger.audit('task.step_compensated', {
          taskId: context.taskId,
          actionId: action.id,
          toolId: action.toolId,
        });
      }
    }

    return actions;
  }
}

/** Runtime artifact as the task records it, with provenance attached. */
function toTaskArtifact(artifact: JarvisArtifact, toolId: string): TaskArtifact {
  return {
    id: artifact.id || randomUUID(),
    kind: kindOf(artifact),
    title: artifact.name,
    mediaType: artifact.mediaType,
    ...(artifact.text === undefined ? {} : { content: artifact.text }),
    ...(artifact.uri === undefined ? {} : { uri: artifact.uri }),
    producedBy: toolId,
    createdAt: new Date().toISOString(),
  };
}

function kindOf(artifact: JarvisArtifact): TaskArtifact['kind'] {
  if (artifact.kind === 'image') return 'image';
  if (artifact.kind === 'data') return 'dataset';
  if (artifact.mediaType.startsWith('text/')) return 'document';
  return 'other';
}

function usage(invocation: {
  toolId: string;
  name: string;
  risk: ToolUsage['risk'];
  status: ToolUsage['status'];
  summary: string;
}): ToolUsage {
  return {
    toolId: invocation.toolId,
    name: invocation.name,
    risk: invocation.risk,
    status: invocation.status,
    summary: invocation.summary,
  };
}

function step(
  action: PlannedAction,
  status: TraceStep['status'],
  detail: string,
  durationMs?: number,
): TraceStep {
  return {
    id: `${action.id}-${status.toLowerCase()}-${action.attempts ?? 0}`,
    label: action.label,
    stage: 'ACT',
    status,
    toolId: action.toolId,
    detail,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

function compensationTrace(actions: PlannedAction[]): TraceStep[] {
  return actions
    .filter((action) => action.status === 'COMPENSATED')
    .map((action) => ({
      id: `${action.id}-compensated`,
      label: `Membatalkan: ${action.label}`,
      stage: 'VERIFY' as const,
      status: 'SUCCEEDED' as const,
      toolId: action.toolId,
      detail: action.detail ?? 'Aksi dibatalkan.',
    }));
}
