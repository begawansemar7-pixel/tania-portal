import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config/configuration.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hasScope, type ActorContext } from '../auth/actor.types.js';
import type { ApprovalStatus } from '../generated/prisma/enums.js';
import type { CreateApprovalDto } from './dto/create-approval.dto.js';
import type { DecideApprovalDto, RecordExecutionDto } from './dto/decide-approval.dto.js';

/** Scope a decision maker must hold. */
export const APPROVE_SCOPE = 'workflow:approve';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async create(actor: ActorContext, dto: CreateApprovalDto) {
    if (dto.sessionId) {
      const session = await this.prisma.session.findUnique({ where: { id: dto.sessionId } });
      if (!session) {
        throw new BadRequestException(`Session ${dto.sessionId} was not found.`);
      }
      if (session.actorId !== actor.id) {
        throw new ForbiddenException('Cannot raise an approval on another actor session.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.approval.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          sessionId: dto.sessionId ?? null,
          messageId: dto.messageId ?? null,
          toolId: dto.toolId,
          action: dto.action,
          risk: dto.risk,
          reason: dto.reason,
          effect: dto.effect ?? null,
          requestedById: actor.id,
        },
      });

      await this.audit.append(tx, {
        event: 'approval.requested',
        actorId: actor.id,
        sessionId: approval.sessionId,
        approvalId: approval.id,
        risk: approval.risk,
        payload: { toolId: approval.toolId, action: approval.action, reason: approval.reason },
      });

      return approval;
    });
  }

  async list(
    actor: ActorContext,
    filters: { status?: ApprovalStatus; sessionId?: string; limit: number },
  ) {
    const canSeeAll = hasScope(actor, APPROVE_SCOPE);

    return this.prisma.approval.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
        ...(canSeeAll ? {} : { requestedById: actor.id }),
      },
      orderBy: { requestedAt: 'desc' },
      take: filters.limit,
    });
  }

  async get(actor: ActorContext, id: string) {
    const approval = await this.prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      throw new NotFoundException(`Approval ${id} was not found.`);
    }
    if (approval.requestedById !== actor.id && !hasScope(actor, APPROVE_SCOPE)) {
      throw new ForbiddenException('Not allowed to read this approval.');
    }
    return approval;
  }

  /**
   * Records a human decision. The update is conditional on the approval still
   * being PENDING, so two approvers racing cannot both decide it.
   */
  async decide(actor: ActorContext, id: string, dto: DecideApprovalDto) {
    if (!hasScope(actor, APPROVE_SCOPE)) {
      throw new ForbiddenException(`Actor lacks the ${APPROVE_SCOPE} scope.`);
    }

    const approval = await this.prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      throw new NotFoundException(`Approval ${id} was not found.`);
    }
    if (approval.status !== 'PENDING') {
      throw new ConflictException(`Approval ${id} is already ${approval.status}.`);
    }
    if (this.config.governance.requireSeparateApprover && approval.requestedById === actor.id) {
      throw new ForbiddenException(
        'Separation of duty: the requester may not approve their own action.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const decidedAt = new Date();
      const updated = await tx.approval.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: dto.decision,
          decidedById: actor.id,
          decidedAt,
          decisionNote: dto.note ?? null,
        },
      });

      if (updated.count === 0) {
        throw new ConflictException(`Approval ${id} was decided by someone else.`);
      }

      await this.audit.append(tx, {
        event: 'approval.decided',
        actorId: actor.id,
        sessionId: approval.sessionId,
        approvalId: id,
        risk: approval.risk,
        payload: {
          decision: dto.decision,
          toolId: approval.toolId,
          requestedById: approval.requestedById,
          note: dto.note ?? null,
          decidedAt: decidedAt.toISOString(),
        },
      });

      return tx.approval.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Records what the runtime actually did after an approval was granted. */
  async recordExecution(actor: ActorContext, id: string, dto: RecordExecutionDto) {
    const approval = await this.prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      throw new NotFoundException(`Approval ${id} was not found.`);
    }
    if (approval.status !== 'APPROVED') {
      throw new ConflictException(
        `Execution can only be recorded for an APPROVED action; this one is ${approval.status}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const executedAt = new Date();
      const updated = await tx.approval.update({
        where: { id },
        data: {
          executionStatus: dto.status,
          executionSummary: dto.summary ?? null,
          executedAt,
        },
      });

      await this.audit.append(tx, {
        event: 'approval.executed',
        actorId: actor.id,
        sessionId: approval.sessionId,
        approvalId: id,
        risk: approval.risk,
        payload: {
          toolId: approval.toolId,
          status: dto.status,
          summary: dto.summary ?? null,
          executedAt: executedAt.toISOString(),
        },
      });

      return updated;
    });
  }
}
