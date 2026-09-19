import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ActorContext } from '../auth/actor.types.js';
import type { CreateSessionDto } from './dto/create-session.dto.js';
import type { RecordTurnDto } from './dto/record-turn.dto.js';

const TITLE_LENGTH = 80;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates a session. When the caller supplies an id the call is idempotent,
   * so a portal session maps to exactly one row however often it is replayed.
   */
  async create(actor: ActorContext, dto: CreateSessionDto) {
    if (dto.id) {
      const existing = await this.prisma.session.findUnique({ where: { id: dto.id } });
      if (existing) {
        if (existing.actorId !== actor.id) {
          throw new ForbiddenException('This session belongs to another actor.');
        }
        return existing;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          actorId: actor.id,
          channel: dto.channel ?? 'portal',
          title: dto.title ?? null,
        },
      });

      await this.audit.append(tx, {
        event: 'session.created',
        actorId: actor.id,
        sessionId: session.id,
        payload: { channel: session.channel },
      });

      return session;
    });
  }

  async list(actor: ActorContext, limit: number) {
    return this.prisma.session.findMany({
      where: { actorId: actor.id },
      orderBy: { lastActivityAt: 'desc' },
      take: limit,
      include: { _count: { select: { messages: true, approvals: true } } },
    });
  }

  async findOwned(actor: ActorContext, sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} was not found.`);
    }
    if (session.actorId !== actor.id) {
      throw new ForbiddenException('This session belongs to another actor.');
    }
    return session;
  }

  async getWithMessages(actor: ActorContext, sessionId: string) {
    await this.findOwned(actor, sessionId);

    return this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { requestedAt: 'desc' } },
      },
    });
  }

  /** Persists a full turn (question + answer) atomically, with its audit event. */
  async recordTurn(actor: ActorContext, sessionId: string, dto: RecordTurnDto) {
    const existing = await this.findOwned(actor, sessionId);

    return this.prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: { sessionId, role: 'USER', content: dto.question },
      });

      const taniaMessage = await tx.message.create({
        data: {
          ...(dto.messageId ? { id: dto.messageId } : {}),
          sessionId,
          role: 'TANIA',
          content: dto.answer,
          intent: dto.intent ?? null,
          risk: dto.risk ?? null,
          model: dto.model ?? null,
          evidence: (dto.evidence ?? []) as Prisma.InputJsonValue,
          trace: (dto.trace ?? []) as Prisma.InputJsonValue,
          tools: (dto.tools ?? []) as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.session.update({
        where: { id: sessionId },
        data: {
          lastActivityAt: new Date(),
          // The first question becomes the session title.
          ...(existing.title ? {} : { title: dto.question.slice(0, TITLE_LENGTH) }),
        },
      });

      await this.audit.append(tx, {
        event: 'session.turn_recorded',
        actorId: actor.id,
        sessionId,
        risk: dto.risk ?? null,
        payload: {
          messageId: taniaMessage.id,
          intent: dto.intent ?? null,
          model: dto.model ?? null,
          evidenceCount: dto.evidence?.length ?? 0,
          toolIds: (dto.tools ?? []).map((tool) => tool.toolId),
        },
      });

      return { userMessage, taniaMessage };
    });
  }
}
