import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActorContext } from '../auth/actor.types.js';
import { hasScope } from '../auth/actor.types.js';
import type { SaveTaskDto } from './dto/save-task.dto.js';
import type { RememberDto } from './dto/remember.dto.js';
import type { RecordGovernanceDto } from './dto/record-governance.dto.js';

/**
 * The three stores that used to live only in portal memory.
 *
 * Tasks, memory, and the governance trail were process-local, so every deploy
 * erased them. A system that promises an auditable execution trace and loses it
 * on restart has not made that promise; this module is what makes it true.
 *
 * Every read is scoped to the calling actor in the query itself rather than
 * filtered afterwards — a `where` that omits the actor is a bug that returns
 * data, and those are the expensive kind.
 */
@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async saveTask(actor: ActorContext, dto: SaveTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id: dto.id } });
    if (existing && existing.actorId !== actor.id) {
      throw new ForbiddenException('This task belongs to another actor.');
    }

    const data = {
      actorId: actor.id,
      status: dto.status,
      approvalIds: dto.approvalIds ?? [],
      report: dto.report as Prisma.InputJsonValue,
    };

    return this.prisma.task.upsert({
      where: { id: dto.id },
      create: { id: dto.id, ...data },
      update: data,
    });
  }

  async getTask(actor: ActorContext, id: string) {
    return this.prisma.task.findFirst({ where: { id, actorId: actor.id } });
  }

  /** Finds the task an approval decision belongs to, without a scan. */
  async findTaskByApproval(actor: ActorContext, approvalId: string) {
    return this.prisma.task.findFirst({
      where: { actorId: actor.id, approvalIds: { has: approvalId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listTasks(actor: ActorContext, limit: number) {
    return this.prisma.task.findMany({
      where: { actorId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Memory ─────────────────────────────────────────────────────────────────

  async remember(actor: ActorContext, dto: RememberDto) {
    return this.prisma.memoryRecord.create({
      data: {
        actorId: actor.id,
        scope: dto.scope,
        key: dto.key,
        value: dto.value,
        classification: dto.classification,
        sessionId: dto.sessionId ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  /**
   * Recall, filtered by clearance in the query.
   *
   * A record classified above the reader is never loaded, rather than loaded
   * and dropped: the difference matters the day something logs what it read.
   */
  async recall(
    actor: ActorContext,
    options: { scope?: string; sessionId?: string; query?: string; limit: number },
  ) {
    const visible = VISIBLE_TO[actor.clearance] ?? ['PUBLIC'];
    const now = new Date();

    return this.prisma.memoryRecord.findMany({
      where: {
        actorId: actor.id,
        classification: { in: visible },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(options.scope ? { scope: options.scope as never } : {}),
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        ...(options.query
          ? {
              OR: [
                { key: { contains: options.query, mode: 'insensitive' as const } },
                { value: { contains: options.query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
  }

  /** Honours a data-subject deletion request; only the owner may forget. */
  async forget(actor: ActorContext, id: string): Promise<boolean> {
    const result = await this.prisma.memoryRecord.deleteMany({
      where: { id, actorId: actor.id },
    });
    return result.count > 0;
  }

  // ── Governance ─────────────────────────────────────────────────────────────

  /**
   * Columns that are safe to serialise.
   *
   * `sequence` is a BigInt and `JSON.stringify` refuses those outright, so
   * selecting explicitly keeps a 500 out of the write path — and keeps the
   * ordering key, which is an internal detail, off the wire.
   */
  private static readonly GOVERNANCE_FIELDS = {
    id: true,
    actorId: true,
    intent: true,
    agent: true,
    tool: true,
    action: true,
    result: true,
    risk: true,
    verificationOk: true,
    dataAccess: true,
    verification: true,
    correlationId: true,
    occurredAt: true,
  } as const;

  async recordGovernance(actor: ActorContext, dto: RecordGovernanceDto) {
    return this.prisma.governanceRecord.create({
      select: WorkspaceService.GOVERNANCE_FIELDS,
      data: {
        actorId: actor.id,
        intent: dto.intent,
        agent: dto.agent,
        tool: dto.tool,
        action: dto.action,
        result: dto.result,
        risk: dto.risk,
        verificationOk: dto.verification.ok,
        dataAccess: dto.dataAccess as Prisma.InputJsonValue,
        verification: dto.verification as unknown as Prisma.InputJsonValue,
        correlationId: dto.correlationId,
        ...(dto.timestamp ? { occurredAt: new Date(dto.timestamp) } : {}),
      },
    });
  }

  /**
   * Reads the governance trail.
   *
   * An actor sees their own records; `audit:read` widens that to everyone's,
   * which is what a compliance reviewer needs and what nobody else should have.
   */
  async listGovernance(actor: ActorContext, limit: number) {
    const auditor = hasScope(actor, 'audit:read');

    return this.prisma.governanceRecord.findMany({
      select: WorkspaceService.GOVERNANCE_FIELDS,
      where: auditor ? {} : { actorId: actor.id },
      orderBy: { sequence: 'desc' },
      take: limit,
    });
  }
}

/** What each clearance may read, lowest first. */
const VISIBLE_TO: Record<string, ('PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED')[]> = {
  PUBLIC: ['PUBLIC'],
  INTERNAL: ['PUBLIC', 'INTERNAL'],
  CONFIDENTIAL: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
  RESTRICTED: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'],
};
