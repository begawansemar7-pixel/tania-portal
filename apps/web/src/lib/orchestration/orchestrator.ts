import { randomUUID } from 'node:crypto';
import type {
  Agent,
  AgentRegistry,
  AgentRouter,
  ApprovalManager,
  ExecutionManager,
  ExecutionOutcome,
  Planner,
  TaskContext,
  TaskStore,
  VerificationManager,
} from '@tania/core/orchestration';
import { canTransition } from '@tania/core/orchestration';
import type { MemoryStore } from '@tania/core/memory';
import type {
  Intent,
  TaskReport,
  TaskRequest,
  TaskState,
  TaskVerification,
  TraceStep,
} from '@tania/types';
import { CATEGORY_FOR_INTENT, RISK_CODE, isTerminalTaskState } from '@tania/types';
import { logger } from '@/lib/logger';
import { TaniaError } from '@tania/config';
import type { Actor } from '@/lib/identity/types';
import type { IntentService } from '@/lib/tania/services/intent-service';
import { planRisk } from './planner';

export interface OrchestratorDependencies {
  intents: IntentService;
  router: AgentRouter;
  /** Needed to resume: a parked task must find its agent again. */
  registry: AgentRegistry;
  planner: Planner;
  execution: ExecutionManager;
  verification: VerificationManager;
  approvals: ApprovalManager;
  tasks: TaskStore;
  memory: MemoryStore;
}

/**
 * Drives one task through its lifecycle.
 *
 * REQUESTED → UNDERSTANDING → PLANNING → [APPROVAL] → EXECUTING → VERIFYING →
 * REPORTING → REMEMBERING → COMPLETED | FAILED | BLOCKED | CANCELLED.
 *
 * Every transition is checked against the table in `@tania/core/orchestration`,
 * so an illegal move is a loud error rather than a task in an impossible state.
 * REPORTING and REMEMBERING run for failures too: a task that went wrong is
 * still reported and still remembered.
 */
export class TaskOrchestrator {
  readonly id = 'lifecycle';

  constructor(private readonly deps: OrchestratorDependencies) {}

  async start(request: TaskRequest, actor: Actor, correlationId: string): Promise<TaskReport> {
    const taskId = randomUUID();
    const now = new Date().toISOString();

    const report: TaskReport = {
      taskId,
      sessionId: request.sessionId,
      question: request.question,
      intent: request.intent ?? 'CONVERSE',
      status: 'REQUESTED',
      plan: [],
      agents: [],
      tools: [],
      evidence: [],
      artifacts: [],
      verification: { ok: true, issues: [], checkedAt: now },
      result: '',
      errors: [],
      trace: [],
      risk: 'INFORMATIONAL',
      riskCode: RISK_CODE.INFORMATIONAL,
      createdAt: now,
      updatedAt: now,
      ...(request.wantsArtifact === undefined ? {} : { wantsArtifact: request.wantsArtifact }),
    };

    await this.deps.tasks.save(report, actor);

    // UNDERSTANDING — decide what is being asked.
    this.move(report, 'UNDERSTANDING', 'Memahami permintaan', 'UNDERSTAND');
    const intent = await this.deps.intents.classify(request.question, request.intent);
    report.intent = intent.value;

    // PLANNING — route to a specialist and build the plan from its tools.
    this.move(report, 'PLANNING', 'Menyusun rencana', 'PLAN');
    report.category = CATEGORY_FOR_INTENT[intent.value];
    const routing = this.deps.router.route({
      message: request.question,
      intent: intent.value,
      actor,
    });

    report.agents = [routing.agent.id];
    report.plan = await this.deps.planner.plan({
      taskId,
      question: request.question,
      intent: intent.value,
      agent: routing.agent,
      actor,
      ...(request.maxRisk === undefined ? {} : { maxRisk: request.maxRisk }),
    });
    report.risk = planRisk(report.plan);
    report.riskCode = RISK_CODE[report.risk];
    report.trace.push(
      trace(`${taskId}-plan`, `Rencana: ${report.plan.length} aksi (${report.riskCode})`, 'PLAN'),
    );

    const context = this.context(taskId, request, actor, correlationId, routing.agent, intent.value);

    // APPROVAL — L3 and L4 never run on their own.
    const gated = this.deps.approvals.gatedActions(report.plan);
    if (gated.length > 0) {
      this.move(report, 'APPROVAL', 'Menunggu persetujuan manusia', 'ACT');

      for (const action of gated) {
        action.approvalId = await this.deps.approvals.request(action, context);
        action.status = 'AWAITING_APPROVAL';
      }

      report.pendingApprovalId = gated[0]?.approvalId;
      return this.persist(report, actor);
    }

    return this.execute(report, context, actor);
  }

  /** Continues a task parked at a gate, after a human decided. */
  async resume(taskId: string, actor: Actor, correlationId: string): Promise<TaskReport> {
    const report = await this.require(taskId, actor);

    if (report.status !== 'APPROVAL') {
      throw TaniaError.conflict(`Tugas ${taskId} tidak sedang menunggu persetujuan.`);
    }

    const gated = report.plan.filter((action) => action.approvalId);
    const granted = new Map<string, string>();

    for (const action of gated) {
      const status = await this.deps.approvals.status(action.approvalId as string, actor);

      if (status === 'REJECTED' || status === 'EXPIRED') {
        action.status = 'BLOCKED';
        action.detail =
          status === 'REJECTED' ? 'Ditolak oleh pemberi persetujuan.' : 'Persetujuan kedaluwarsa.';
        report.errors.push({
          code: 'APPROVAL_DENIED',
          message: action.detail,
          actionId: action.id,
          recoverable: false,
        });
        report.trace.push(trace(`${action.id}-denied`, action.detail, 'ACT', 'BLOCKED'));
        return this.settle(report, 'BLOCKED', actor);
      }

      if (status === 'PENDING') {
        // Still waiting: nothing changes, and the task stays parked.
        return report;
      }

      action.status = 'PLANNED';
      granted.set(action.toolId, action.approvalId as string);
    }

    const agent = this.agentOf(report);
    const context = this.context(
      report.taskId,
      { question: report.question, sessionId: report.sessionId, wantsArtifact: report.wantsArtifact },
      actor,
      correlationId,
      agent,
      report.intent,
    );
    context.grantedApprovals = granted;

    delete report.pendingApprovalId;
    return this.execute(report, context, actor);
  }

  async cancel(taskId: string, actor: Actor, reason: string): Promise<TaskReport> {
    const report = await this.require(taskId, actor);

    if (isTerminalTaskState(report.status)) {
      throw TaniaError.conflict(`Tugas ${taskId} sudah berakhir dengan status ${report.status}.`);
    }

    const agent = this.agentOf(report);
    const context = this.context(
      report.taskId,
      { question: report.question, sessionId: report.sessionId },
      actor,
      report.taskId,
      agent,
      report.intent,
    );

    // Undo whatever already changed before declaring the task cancelled.
    await this.deps.execution.compensate(report.plan, context);

    report.errors.push({ code: 'CANCELLED', message: reason, recoverable: false });
    report.trace.push(trace(`${taskId}-cancel`, `Dibatalkan: ${reason}`, 'ACT', 'BLOCKED'));

    return this.settle(report, 'CANCELLED', actor);
  }

  async get(taskId: string, actor: Actor): Promise<TaskReport | undefined> {
    return this.deps.tasks.get(taskId, actor);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async execute(
    report: TaskReport,
    context: TaskContext,
    actor: Actor,
  ): Promise<TaskReport> {
    this.move(report, 'EXECUTING', 'Menjalankan rencana', 'ACT');
    const outcome = await this.deps.execution.run(report.plan, context);

    report.plan = outcome.actions;
    report.tools = [...report.tools, ...outcome.tools];
    report.trace.push(...outcome.trace);
    report.evidence = [...report.evidence, ...outcome.evidence];
    report.artifacts = [...report.artifacts, ...outcome.artifacts];
    report.errors.push(...outcome.errors);

    if (outcome.status === 'AWAITING_APPROVAL') {
      this.move(report, 'APPROVAL', 'Menunggu persetujuan manusia', 'ACT');
      report.pendingApprovalId = outcome.pendingApprovalId;
      return this.persist(report, actor);
    }

    // VERIFYING — did what happened match what was planned?
    //
    // The agent's own `verify` is not called here on purpose: it judges an
    // execution the agent produced, and this plan was run by the execution
    // manager. Judging someone else's run by the agent's answer-quality rules
    // produced false failures. Governance invariants are checked instead.
    this.move(report, 'VERIFYING', 'Memverifikasi hasil', 'VERIFY');
    report.verification = await this.deps.verification.verify({
      context,
      outcome,
      wantsArtifact: context.wantsArtifact === true,
    });

    // Verification's findings are recorded on the artifact itself, so a draft
    // carries its own judgement wherever it is later opened.
    for (const artifact of report.artifacts) {
      artifact.verified = report.verification.ok;
      if (!report.verification.ok) artifact.issues = report.verification.issues;
    }

    return this.settle(report, this.outcomeState(outcome, report.verification), actor);
  }

  /** REPORTING and REMEMBERING run for every ending, success or not. */
  private async settle(report: TaskReport, final: TaskState, actor: Actor): Promise<TaskReport> {
    this.move(report, 'REPORTING', 'Menyusun laporan', 'VERIFY');
    report.result = composeResult(report, final);

    this.move(report, 'REMEMBERING', 'Menyimpan hasil ke memori', 'LEARN');
    try {
      await this.deps.memory.remember(
        {
          scope: 'SESSION',
          key: `task.${report.taskId}`,
          value: `${final}: ${report.result}`,
          classification: 'INTERNAL',
          sessionId: report.sessionId,
        },
        actor,
      );
    } catch (error) {
      // Memory is best effort: a task that finished must not be undone by it.
      logger.warn('task.memory_write_failed', {
        taskId: report.taskId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.move(report, final, `Tugas berakhir: ${final}`, 'VERIFY');

    logger.audit('task.settled', {
      taskId: report.taskId,
      status: final,
      actorId: actor.id,
      agents: report.agents,
      risk: report.risk,
      riskCode: report.riskCode,
      tools: report.tools.map((tool) => tool.toolId),
      verified: report.verification.ok,
      errors: report.errors.length,
    });

    return this.persist(report, actor);
  }

  private outcomeState(outcome: ExecutionOutcome, verification: TaskVerification): TaskState {
    if (outcome.status === 'BLOCKED') return 'BLOCKED';
    if (outcome.status === 'FAILED') return 'FAILED';
    if (outcome.status === 'CANCELLED') return 'CANCELLED';
    return verification.ok ? 'COMPLETED' : 'FAILED';
  }

  private move(report: TaskReport, to: TaskState, label: string, stage: TraceStep['stage']): void {
    if (!canTransition(report.status, to)) {
      throw TaniaError.internal(
        `Transisi tidak sah pada tugas ${report.taskId}: ${report.status} → ${to}.`,
      );
    }

    report.status = to;
    report.updatedAt = new Date().toISOString();
    report.trace.push(trace(`${report.taskId}-${to.toLowerCase()}`, label, stage));
  }

  private context(
    taskId: string,
    request: { question: string; sessionId: string; wantsArtifact?: boolean },
    actor: Actor,
    correlationId: string,
    agent: Agent,
    intent: Intent,
  ): TaskContext {
    return {
      taskId,
      sessionId: request.sessionId,
      correlationId,
      actor,
      agent,
      question: request.question,
      intent,
      ...(request.wantsArtifact === undefined ? {} : { wantsArtifact: request.wantsArtifact }),
    };
  }

  private agentOf(report: TaskReport): Agent {
    const agentId = report.agents[0];
    if (!agentId) {
      throw TaniaError.internal(`Tugas ${report.taskId} tidak memiliki agen penanggung jawab.`);
    }

    const agent = this.deps.registry.find(agentId);
    if (!agent) {
      throw TaniaError.internal(`Agen ${agentId} tidak ditemukan untuk melanjutkan tugas.`);
    }
    return agent;
  }

  private async require(taskId: string, actor: Actor): Promise<TaskReport> {
    const report = await this.deps.tasks.get(taskId, actor);
    if (!report) throw TaniaError.notFound(`Tugas ${taskId} tidak ditemukan.`);
    return report;
  }

  private async persist(report: TaskReport, actor: Actor): Promise<TaskReport> {
    report.updatedAt = new Date().toISOString();
    await this.deps.tasks.save(report, actor);
    return report;
  }
}

function trace(
  id: string,
  label: string,
  stage: TraceStep['stage'],
  status: TraceStep['status'] = 'SUCCEEDED',
): TraceStep {
  return { id, label, stage, status };
}

/** The user-facing result. Status, what ran, and what backs it — nothing else. */
export function composeResult(report: TaskReport, final: TaskState): string {
  const ran = report.plan.filter((action) => action.status === 'SUCCEEDED');
  const blocked = report.plan.filter((action) => action.status === 'BLOCKED');
  const compensated = report.plan.filter((action) => action.status === 'COMPENSATED');

  const lines: string[] = [];

  switch (final) {
    case 'COMPLETED':
      lines.push(`Tugas selesai: ${ran.length} aksi dijalankan.`);
      break;
    case 'FAILED':
      lines.push('Tugas gagal diselesaikan.');
      break;
    case 'BLOCKED':
      lines.push('Tugas dihentikan kebijakan sebelum aksi berjalan.');
      break;
    case 'CANCELLED':
      lines.push('Tugas dibatalkan.');
      break;
    default:
      lines.push(`Tugas berstatus ${final}.`);
  }

  const searched = report.tools.some(
    (tool) => tool.toolId === 'knowledge.search' && tool.status === 'SUCCEEDED',
  );

  if (report.artifacts.length > 0) {
    const names = report.artifacts.map((artifact) => artifact.title).join(', ');
    lines.push(`${report.artifacts.length} artefak dihasilkan: ${names}.`);
  }

  if (report.evidence.length > 0) {
    lines.push(`${report.evidence.length} sumber dikutip sebagai dasar.`);
  } else if (searched) {
    // Saying so is the point: TANIA found nothing it may cite, and will not
    // present the run as if it had grounds it does not have.
    lines.push(
      'Tidak ada sumber yang relevan dan boleh diakses ditemukan, jadi hasil ini tidak didasarkan pada pengetahuan enterprise.',
    );
  }
  if (blocked.length > 0) {
    lines.push(`${blocked.length} aksi diblokir: ${blocked.map((a) => a.toolId).join(', ')}.`);
  }
  if (compensated.length > 0) {
    lines.push(`${compensated.length} aksi dibatalkan kembali agar tidak setengah jalan.`);
  }
  if (!report.verification.ok) {
    lines.push(`Verifikasi menemukan: ${report.verification.issues.join(' ')}`);
  }

  return lines.join(' ');
}
