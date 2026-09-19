import type { GovernanceEvent, TaskReport } from '@tania/types';
import type { MemoryQuery, MemoryRecord, MemoryStore, MemoryWrite } from '@tania/core/memory';
import type { TaskStore } from '@tania/core/orchestration';
import type { Actor } from '@/lib/identity/types';
import type { GovernanceSink } from '@/lib/governance/audit/recorder';
import { logger } from '@/lib/logger';
import type { TaniaApiClient } from '@/lib/tania/api/client';

/**
 * PostgreSQL-backed homes for the three stores that used to live only in this
 * process: task reports, memory, and the governance trail.
 *
 * Losing any of them on restart is not a cache miss. A task is a long-running
 * unit of work that can be parked awaiting a human decision — losing it strands
 * the decision. A governance record is the evidence that a risky action was
 * authorised; a trail that is erased by a deploy cannot be that evidence.
 *
 * Every call passes the actor, because the backend scopes by it in the query.
 */

/**
 * The portal's own identity for aggregate reads.
 *
 * `/api/metrics` has no user to attribute a read to, and must not invent one
 * with real privileges. This carries `audit:read` and nothing else: enough to
 * count records, not enough to act.
 */
export const SYSTEM_READER: Actor = {
  id: 'system.metrics',
  subject: 'system.metrics',
  issuer: 'urn:tania:system',
  name: 'TANIA Metrics',
  email: 'metrics@tania.local',
  clearance: 'PUBLIC',
  scopes: ['audit:read'],
};

interface StoredTask {
  id: string;
  report: TaskReport;
}

export class HttpTaskStore implements TaskStore {
  readonly id = 'postgres';

  constructor(private readonly client: TaniaApiClient) {}

  async save(report: TaskReport, actor: Actor): Promise<void> {
    await this.client.request<StoredTask>('POST', '/v1/tasks', actor, {
      id: report.taskId,
      status: report.status,
      // Promoted out of the report so a decided approval can find its task
      // without the backend scanning every row.
      approvalIds: report.plan
        .map((action) => action.approvalId)
        .filter((id): id is string => typeof id === 'string'),
      report,
    });
  }

  async get(taskId: string, actor: Actor): Promise<TaskReport | undefined> {
    try {
      const stored = await this.client.request<StoredTask>(
        'GET',
        `/v1/tasks/${encodeURIComponent(taskId)}`,
        actor,
      );
      return stored.report;
    } catch {
      // Unknown and not-yours are answered identically upstream, so both land
      // here as "no task" rather than as an error the caller must interpret.
      return undefined;
    }
  }

  async findByApproval(approvalId: string, actor: Actor): Promise<TaskReport | undefined> {
    const stored = await this.client.request<StoredTask[]>(
      'GET',
      `/v1/tasks?approvalId=${encodeURIComponent(approvalId)}`,
      actor,
    );
    return stored[0]?.report;
  }

  async list(actor: Actor, limit: number): Promise<TaskReport[]> {
    const stored = await this.client.request<StoredTask[]>(
      'GET',
      `/v1/tasks?limit=${limit}`,
      actor,
    );
    return stored.map((row) => row.report);
  }
}

interface StoredMemory {
  id: string;
  scope: MemoryRecord['scope'];
  key: string;
  value: string;
  classification: MemoryRecord['classification'];
  sessionId: string | null;
  createdAt: string;
  updatedAt: string | null;
  expiresAt: string | null;
}

export class HttpMemoryStore implements MemoryStore {
  readonly id = 'postgres';

  constructor(private readonly client: TaniaApiClient) {}

  async remember(write: MemoryWrite, actor: Actor): Promise<MemoryRecord> {
    const stored = await this.client.request<StoredMemory>('POST', '/v1/memory', actor, {
      scope: write.scope,
      key: write.key,
      value: write.value,
      classification: write.classification,
      ...(write.sessionId === undefined ? {} : { sessionId: write.sessionId }),
      ...(write.expiresAt === undefined ? {} : { expiresAt: write.expiresAt }),
    });

    return toMemoryRecord(stored, actor);
  }

  async recall(query: MemoryQuery, actor: Actor): Promise<MemoryRecord[]> {
    const params = new URLSearchParams({ limit: String(query.limit) });
    if (query.scope) params.set('scope', query.scope);
    if (query.sessionId) params.set('sessionId', query.sessionId);
    if (query.query) params.set('query', query.query);

    const stored = await this.client.request<StoredMemory[]>(
      'GET',
      `/v1/memory?${params.toString()}`,
      actor,
    );

    return stored.map((row) => toMemoryRecord(row, actor));
  }

  async forget(recordId: string, actor: Actor): Promise<void> {
    await this.client.request('DELETE', `/v1/memory/${encodeURIComponent(recordId)}`, actor);
  }

  /**
   * Forgets everything a session remembered.
   *
   * Reads first so the count is real: a data-subject request that reports "some
   * number of records deleted" without knowing which is not an answer.
   */
  async forgetSession(sessionId: string, actor: Actor): Promise<number> {
    const records = await this.recall({ sessionId, limit: 100 }, actor);

    let forgotten = 0;
    for (const record of records) {
      await this.forget(record.id, actor);
      forgotten += 1;
    }

    return forgotten;
  }
}

interface StoredGovernance {
  id: string;
  actorId: string;
  intent: string;
  agent: string;
  tool: string;
  action: string;
  result: string;
  risk: GovernanceEvent['risk'];
  dataAccess: GovernanceEvent['dataAccess'];
  verification: GovernanceEvent['verification'];
  correlationId: string;
  occurredAt: string;
}

export class HttpGovernanceSink implements GovernanceSink {
  readonly id = 'postgres';
  readonly durable = true;

  constructor(private readonly client: TaniaApiClient) {}

  async record(event: GovernanceEvent, actor: Actor): Promise<void> {
    await this.client.request('POST', '/v1/governance', actor, {
      intent: event.intent,
      agent: event.agent,
      tool: event.tool,
      action: event.action,
      result: event.result,
      risk: event.risk,
      dataAccess: event.dataAccess,
      verification: event.verification,
      correlationId: event.correlationId,
      timestamp: event.timestamp,
    });
  }

  async list(actor: Actor, limit: number): Promise<GovernanceEvent[]> {
    const stored = await this.client.request<StoredGovernance[]>(
      'GET',
      `/v1/governance?limit=${limit}`,
      actor,
    );
    return stored.map(toGovernanceEvent);
  }

  /** Aggregate read for the evaluator; reads as the portal, not as a user. */
  async all(limit = 500, actor: Actor = SYSTEM_READER): Promise<GovernanceEvent[]> {
    try {
      const stored = await this.client.request<StoredGovernance[]>(
        'GET',
        `/v1/governance?limit=${limit}`,
        actor,
      );
      return stored.map(toGovernanceEvent);
    } catch (error) {
      // Metrics must degrade, not fail: an unreachable backend should not turn
      // a scrape into a 500 that looks like the portal is down.
      logger.warn('governance.aggregate_unavailable', {
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

function toMemoryRecord(row: StoredMemory, actor: Actor): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    key: row.key,
    value: row.value,
    classification: row.classification,
    actorId: actor.id,
    createdAt: row.createdAt,
    ...(row.sessionId === null ? {} : { sessionId: row.sessionId }),
    ...(row.updatedAt === null ? {} : { updatedAt: row.updatedAt }),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt }),
  };
}

function toGovernanceEvent(row: StoredGovernance): GovernanceEvent {
  return {
    user: row.actorId,
    intent: row.intent as GovernanceEvent['intent'],
    agent: row.agent,
    tool: row.tool,
    action: row.action as GovernanceEvent['action'],
    result: row.result as GovernanceEvent['result'],
    risk: row.risk,
    dataAccess: row.dataAccess,
    verification: row.verification,
    correlationId: row.correlationId,
    timestamp: row.occurredAt,
  };
}
