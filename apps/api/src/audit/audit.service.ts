import { createHash } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { canonicalJson } from '../common/canonical-json.js';
import { StructuredLogger } from '../common/logger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hasScope, type ActorContext } from '../auth/actor.types.js';
import type { AuditHashInput, AuditInput, ChainVerification } from './audit.types.js';

/** First link of the chain; nothing precedes it. */
export const GENESIS_HASH = '0'.repeat(64);

/** Advisory lock key that serialises audit appends within a transaction. */
const AUDIT_LOCK_KEY = 728_141_001;

const PAGE_SIZE = 500;

/** Pure hash function — exported so the chain can be recomputed and tested independently. */
export function computeAuditHash(input: AuditHashInput): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        prevHash: input.prevHash,
        occurredAt: input.occurredAt.toISOString(),
        event: input.event,
        actorId: input.actorId ?? null,
        sessionId: input.sessionId ?? null,
        approvalId: input.approvalId ?? null,
        risk: input.risk ?? null,
        payload: input.payload,
      }),
    )
    .digest('hex');
}

/**
 * Append-only audit trail.
 *
 * Every row carries the hash of its predecessor, so deleting or editing a past
 * event invalidates every later hash — that is what makes an approval decision
 * non-repudiable rather than merely recorded.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLogger,
  ) {}

  /** Appends inside an existing transaction so the event cannot be lost on rollback. */
  async append(tx: Prisma.TransactionClient, input: AuditInput) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY}::bigint)`;

    const last = await tx.auditEvent.findFirst({
      orderBy: { sequence: 'desc' },
      select: { hash: true },
    });

    const occurredAt = new Date();
    const prevHash = last?.hash ?? GENESIS_HASH;
    const hash = computeAuditHash({ ...input, prevHash, occurredAt });

    const created = await tx.auditEvent.create({
      data: {
        event: input.event,
        actorId: input.actorId ?? null,
        sessionId: input.sessionId ?? null,
        approvalId: input.approvalId ?? null,
        risk: input.risk ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        occurredAt,
        prevHash,
        hash,
      },
    });

    this.logger.audit(input.event, {
      auditId: created.id,
      actorId: input.actorId,
      sessionId: input.sessionId,
      approvalId: input.approvalId,
      risk: input.risk,
      hash,
    });

    return created;
  }

  /** Appends in its own transaction. */
  async record(input: AuditInput) {
    return this.prisma.$transaction((tx) => this.append(tx, input));
  }

  /**
   * Actors see the events they caused and the trail of their own sessions;
   * a system administrator sees everything.
   */
  async list(
    actor: ActorContext,
    filters: { sessionId?: string; approvalId?: string; event?: string; limit: number },
  ) {
    const isAdmin = hasScope(actor, 'system:admin');
    let ownScope: Prisma.AuditEventWhereInput | undefined;

    if (!isAdmin) {
      if (filters.sessionId) {
        const session = await this.prisma.session.findUnique({
          where: { id: filters.sessionId },
          select: { actorId: true },
        });
        if (!session || session.actorId !== actor.id) {
          throw new ForbiddenException('Not allowed to read the audit trail of this session.');
        }
      } else {
        const sessions = await this.prisma.session.findMany({
          where: { actorId: actor.id },
          select: { id: true },
        });
        ownScope = {
          OR: [{ actorId: actor.id }, { sessionId: { in: sessions.map((session) => session.id) } }],
        };
      }
    }

    const events = await this.prisma.auditEvent.findMany({
      where: {
        ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
        ...(filters.approvalId ? { approvalId: filters.approvalId } : {}),
        ...(filters.event ? { event: filters.event } : {}),
        ...ownScope,
      },
      orderBy: { sequence: 'desc' },
      take: filters.limit,
    });

    return events.map((event) => ({
      id: event.id,
      sequence: event.sequence.toString(),
      occurredAt: event.occurredAt.toISOString(),
      event: event.event,
      actorId: event.actorId,
      sessionId: event.sessionId,
      approvalId: event.approvalId,
      risk: event.risk,
      payload: event.payload,
      prevHash: event.prevHash,
      hash: event.hash,
    }));
  }

  /** Recomputes the whole chain and reports the first inconsistency, if any. */
  async verify(): Promise<ChainVerification> {
    let prevHash = GENESIS_HASH;
    let count = 0;
    let cursor: bigint | undefined;

    for (;;) {
      const page = await this.prisma.auditEvent.findMany({
        orderBy: { sequence: 'asc' },
        take: PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor: { sequence: cursor }, skip: 1 }),
      });
      if (page.length === 0) break;

      for (const event of page) {
        const expected = computeAuditHash({
          event: event.event,
          actorId: event.actorId,
          sessionId: event.sessionId,
          approvalId: event.approvalId,
          risk: event.risk,
          payload: (event.payload ?? {}) as Record<string, unknown>,
          prevHash,
          occurredAt: event.occurredAt,
        });

        if (expected !== event.hash || event.prevHash !== prevHash) {
          return {
            ok: false,
            count,
            brokenAtSequence: event.sequence.toString(),
            checkedAt: new Date().toISOString(),
          };
        }

        prevHash = event.hash;
        count += 1;
      }

      cursor = page[page.length - 1].sequence;
    }

    return { ok: true, count, checkedAt: new Date().toISOString() };
  }
}
