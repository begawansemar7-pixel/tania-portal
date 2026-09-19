import type {
  DataAccessRecord,
  GovernanceAction,
  GovernanceEvent,
  GovernanceResult,
  TaskReport,
} from '@tania/types';
import { isCompleteGovernanceEvent } from '@tania/types';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';

/**
 * Where governance records go.
 *
 * The actor travels with every call for the same reason it does on the task
 * store: a durable implementation has to prove who is asking to the service
 * holding the rows, and an id alone cannot do that.
 */
export interface GovernanceSink {
  readonly id: string;
  readonly durable: boolean;
  record(event: GovernanceEvent, actor: Actor): Promise<void>;
  list(actor: Actor, limit: number): Promise<GovernanceEvent[]>;
  /** Every record the evaluator should see, read as the portal itself. */
  all(limit?: number): Promise<GovernanceEvent[]>;
}

/**
 * Where governance records go when nothing durable is configured.
 *
 * Reports `durable: false` so the interface can say plainly that this trail
 * does not survive a restart — an audit trail whose limits are hidden is worse
 * than none, because people rely on it.
 */
export class InMemoryGovernanceSink implements GovernanceSink {
  readonly id = 'memory';
  readonly durable = false;

  private readonly events: GovernanceEvent[] = [];

  constructor(private readonly limit = 1000) {}

  async record(event: GovernanceEvent, _actor?: Actor): Promise<void> {
    this.events.push(event);
    if (this.events.length > this.limit) this.events.shift();
  }

  async list(actor: Actor, limit: number): Promise<GovernanceEvent[]> {
    return this.events
      .filter((event) => event.user === actor.id)
      .slice(-limit)
      .reverse();
  }

  /** Every record, for the evaluator. Not exposed over HTTP. */
  async all(limit = this.limit): Promise<GovernanceEvent[]> {
    return this.events.slice(-limit);
  }
}

/**
 * The one place a governance record is written.
 *
 * Incomplete records are **rejected**, not stored: a trail that silently
 * accepts a half-filled row looks complete and is not, and nobody discovers
 * that until an audit needs it.
 */
export class GovernanceRecorder {
  constructor(private readonly sink: GovernanceSink) {}

  get durable(): boolean {
    return this.sink.durable;
  }

  async record(event: GovernanceEvent, actor: Actor): Promise<void> {
    // Narrowed through `unknown` so the guard is a real check rather than a
    // tautology the compiler optimises away.
    if (!isCompleteGovernanceEvent(event as unknown)) {
      logger.error('governance.incomplete_record', {
        correlationId: event.correlationId ?? 'unknown',
        action: event.action ?? 'unknown',
      });
      throw new Error('Catatan tata kelola tidak lengkap dan tidak disimpan.');
    }

    await this.sink.record(event, actor);

    logger.audit('governance.recorded', {
      user: event.user,
      intent: event.intent,
      ...(event.agent === undefined ? {} : { agent: event.agent }),
      ...(event.tool === undefined ? {} : { tool: event.tool }),
      action: event.action,
      result: event.result,
      verified: event.verification.ok,
      classification: event.dataAccess.classification,
      resources: event.dataAccess.count,
      correlationId: event.correlationId,
      ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
    });
  }

  list(actor: Actor, limit = 100): Promise<GovernanceEvent[]> {
    return this.sink.list(actor, limit);
  }

  /** Every record the evaluator should see. */
  all(limit?: number): Promise<GovernanceEvent[]> {
    return this.sink.all(limit);
  }
}

/** What a finished task did, as a governance record. */
export function eventFromTask(task: TaskReport, correlationId: string, user: string): GovernanceEvent {
  const executed = task.tools.some((tool) => tool.risk === 'HIGH' || tool.risk === 'CRITICAL');
  const drafted = task.artifacts.length > 0;

  return {
    user,
    intent: task.intent,
    ...(task.agents[0] === undefined ? {} : { agent: task.agents[0] }),
    ...(task.tools[task.tools.length - 1] === undefined
      ? {}
      : { tool: task.tools[task.tools.length - 1]?.toolId }),
    dataAccess: dataAccessOf(task),
    action: actionOf({ executed, drafted, status: task.status }),
    result: resultOf(task.status),
    verification: { ok: task.verification.ok, issues: task.verification.issues },
    timestamp: task.updatedAt,
    correlationId,
    taskId: task.taskId,
    sessionId: task.sessionId,
    risk: task.risk,
    ...(task.category === undefined ? {} : { category: task.category }),
    ...(task.pendingApprovalId === undefined ? {} : { approvalId: task.pendingApprovalId }),
  };
}

/**
 * What the task reached, from its evidence.
 *
 * `filtered` is true whenever retrieval ran: permission-aware retrieval always
 * narrows by the actor's clearance, whether or not anything was withheld this
 * time.
 */
export function dataAccessOf(task: TaskReport): DataAccessRecord {
  const searched = task.tools.some((tool) => tool.toolId === 'knowledge.search');
  const classifications = task.evidence.map((item) => item.classification);

  return {
    resources: task.evidence.map((item) => item.id),
    classification: highestClassification(classifications),
    count: task.evidence.length,
    filtered: searched,
  };
}

const CLASSIFICATION_ORDER = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

function highestClassification(
  values: readonly DataAccessRecord['classification'][],
): DataAccessRecord['classification'] {
  return values.reduce<DataAccessRecord['classification']>(
    (highest, value) =>
      CLASSIFICATION_ORDER.indexOf(value) > CLASSIFICATION_ORDER.indexOf(highest) ? value : highest,
    'PUBLIC',
  );
}

function actionOf(input: {
  executed: boolean;
  drafted: boolean;
  status: TaskReport['status'];
}): GovernanceAction {
  if (input.status === 'APPROVAL') return 'EXECUTE';
  if (input.executed) return 'EXECUTE';
  if (input.drafted) return 'DRAFT';
  return 'RETRIEVE';
}

function resultOf(status: TaskReport['status']): GovernanceResult {
  switch (status) {
    case 'COMPLETED':
      return 'SUCCEEDED';
    case 'APPROVAL':
      return 'AWAITING_APPROVAL';
    case 'BLOCKED':
      return 'BLOCKED';
    default:
      return 'FAILED';
  }
}
