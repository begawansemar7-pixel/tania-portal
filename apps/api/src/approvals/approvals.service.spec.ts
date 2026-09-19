import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service.js';
import type { AppConfig } from '../config/configuration.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ActorContext } from '../auth/actor.types.js';
import type { ApprovalStatus, RiskLevel } from '../generated/prisma/enums.js';

const approver: ActorContext = {
  id: 'actor-approver',
  subject: 'approver',
  issuer: 'urn:tania:portal',
  name: 'Approver',
  email: 'approver@dps.telkom.example',
  clearance: 'CONFIDENTIAL',
  scopes: ['workflow:run', 'workflow:approve'],
};

const requester: ActorContext = { ...approver, id: 'actor-requester', scopes: ['workflow:run'] };

const pendingApproval: {
  id: string;
  sessionId: string;
  status: ApprovalStatus;
  risk: RiskLevel;
  toolId: string;
  requestedById: string;
} = {
  id: 'approval-1',
  sessionId: 'session-1',
  status: 'PENDING',
  risk: 'HIGH',
  toolId: 'workflow.execute',
  requestedById: 'actor-requester',
};

interface PrismaStub {
  approval: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

function makeService(
  overrides: { approval?: Partial<typeof pendingApproval> | null; config?: Partial<AppConfig['governance']> } = {},
) {
  const approval = overrides.approval === null ? null : { ...pendingApproval, ...overrides.approval };

  const prisma: PrismaStub = {
    approval: {
      findUnique: vi.fn().mockResolvedValue(approval),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...approval, status: 'APPROVED' }),
      update: vi.fn().mockResolvedValue({ ...approval, executionStatus: 'SUCCEEDED' }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };

  const audit = { append: vi.fn().mockResolvedValue(undefined) };

  const config = {
    governance: { requireSeparateApprover: false, ...overrides.config },
  } as AppConfig;

  const service = new ApprovalsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    config,
  );

  return { service, prisma, audit };
}

describe('ApprovalsService.decide', () => {
  let subject: ReturnType<typeof makeService>;

  beforeEach(() => {
    subject = makeService();
  });

  it('refuses an actor without the approve scope', async () => {
    await expect(
      subject.service.decide(requester, 'approval-1', { decision: 'APPROVED' }),
    ).rejects.toThrow(ForbiddenException);
    expect(subject.prisma.approval.updateMany).not.toHaveBeenCalled();
  });

  it('records the decision and writes an audit event', async () => {
    await subject.service.decide(approver, 'approval-1', { decision: 'APPROVED', note: 'ok' });

    expect(subject.prisma.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'approval-1', status: 'PENDING' } }),
    );
    expect(subject.audit.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: 'approval.decided', approvalId: 'approval-1' }),
    );
  });

  it('rejects a second decision on an already decided approval', async () => {
    const decided = makeService({ approval: { status: 'APPROVED' } });
    await expect(
      decided.service.decide(approver, 'approval-1', { decision: 'REJECTED' }),
    ).rejects.toThrow(ConflictException);
  });

  it('detects a concurrent decision through the conditional update', async () => {
    subject.prisma.approval.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      subject.service.decide(approver, 'approval-1', { decision: 'APPROVED' }),
    ).rejects.toThrow(ConflictException);
  });

  it('enforces separation of duty when configured', async () => {
    const strict = makeService({
      approval: { requestedById: approver.id },
      config: { requireSeparateApprover: true },
    });
    await expect(
      strict.service.decide(approver, 'approval-1', { decision: 'APPROVED' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('fails when the approval does not exist', async () => {
    const missing = makeService({ approval: null });
    await expect(
      missing.service.decide(approver, 'approval-1', { decision: 'APPROVED' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ApprovalsService.recordExecution', () => {
  it('only accepts execution results for approved actions', async () => {
    const pending = makeService();
    await expect(
      pending.service.recordExecution(approver, 'approval-1', { status: 'SUCCEEDED' }),
    ).rejects.toThrow(ConflictException);
  });

  it('stores the runtime outcome and audits it', async () => {
    const approved = makeService({ approval: { status: 'APPROVED' } });
    await approved.service.recordExecution(approver, 'approval-1', {
      status: 'SUCCEEDED',
      summary: 'Workflow selesai',
    });

    expect(approved.prisma.approval.update).toHaveBeenCalled();
    expect(approved.audit.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: 'approval.executed' }),
    );
  });
});
