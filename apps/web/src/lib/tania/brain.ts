import { randomUUID } from 'node:crypto';
import type { Actor } from '@/lib/identity/types';
import { logger } from '@/lib/logger';
import { classifyIntent } from './intent';
import type { LlmMessage, LlmProvider, LlmRequest, LlmResult } from './llm';
import type { KnowledgeRetriever } from './rag';
import type { JarvisRuntime } from './runtime/jarvis';
import type { ApprovalStore } from './approvals/store';
import { evaluatePolicy } from './tools/policy';
import { findTool, type ToolDefinition } from './tools/registry';
import type { Confidence, RetrievedDocument } from '@tania/types';
import {
  RISK_LEVELS,
  type ApprovalRequest,
  type AskRequest,
  type AskResponse,
  type Evidence,
  type Intent,
  type RiskLevel,
  type ToolUsage,
  type TraceStep,
} from './types';

const SYSTEM_PROMPT = [
  'You are TANIA, the AI Employee for Telkom Digital Product & Solution (DPS).',
  'Answer concisely and professionally, always grounded in the supplied evidence.',
  'Never reveal internal reasoning; report only conclusions, evidence and execution status.',
].join(' ');

/** Which controlled tools each intent is allowed to plan. */
const TOOL_PLAN: Record<Intent, string[]> = {
  SEARCH: ['knowledge.search'],
  CONVERSE: ['knowledge.search'],
  ANALYZE: ['knowledge.search', 'analytics.query'],
  CREATE: ['knowledge.search', 'document.draft'],
  AUTOMATE: ['knowledge.search', 'workflow.execute'],
};

/**
 * Progress callbacks.
 *
 * They report *where the pipeline is* and stream the answer text — never
 * intermediate reasoning, which is not produced, stored, or emitted anywhere.
 */
export interface AskHooks {
  onPhase?: (phase: AskPhase) => void;
  onEvidence?: (evidence: Evidence[]) => void;
  onAnswerChunk?: (text: string) => void;
}

export interface AskOptions {
  hooks?: AskHooks;
  /**
   * Prior turns of this conversation.
   *
   * Supplied by the service from the transcript store — never accepted from the
   * client, so a caller cannot forge what TANIA believes was already said.
   */
  history?: LlmMessage[];
  /** Screen context lines, already sanitised by the context service. */
  hints?: string[];
}

export type AskPhase =
  | 'UNDERSTANDING'
  | 'RETRIEVING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'COMPOSING'
  | 'VERIFYING';

export interface BrainDependencies {
  llm: LlmProvider;
  retriever: KnowledgeRetriever;
  runtime: JarvisRuntime;
  approvals: ApprovalStore;
  topK: number;
  approvalThreshold: RiskLevel;
}

function maxRisk(risks: RiskLevel[]): RiskLevel {
  return risks.reduce<RiskLevel>(
    (highest, risk) =>
      RISK_LEVELS.indexOf(risk) > RISK_LEVELS.indexOf(highest) ? risk : highest,
    'INFORMATIONAL',
  );
}

/**
 * TANIA Brain — the intelligence/orchestration layer.
 *
 * It owns the loop UNDERSTAND → PLAN → (approve) → ACT → VERIFY and produces
 * an auditable trace plus citations for every answer. Execution always happens
 * through the runtime adapter, never directly against enterprise systems.
 */
export class TaniaBrain {
  constructor(private readonly deps: BrainDependencies) {}

  async ask(
    request: AskRequest,
    actor: Actor,
    options: AskOptions = {},
  ): Promise<AskResponse> {
    const hooks = options.hooks ?? {};
    const startedAt = Date.now();
    const messageId = randomUUID();
    const intent = request.intent ?? classifyIntent(request.message);
    const trace: TraceStep[] = [];
    hooks.onPhase?.('UNDERSTANDING');
    const toolsUsed: ToolUsage[] = [];

    trace.push({
      id: `${messageId}-understand`,
      label: `Memahami permintaan sebagai intent ${intent}`,
      status: 'SUCCEEDED',
      stage: 'UNDERSTAND',
    });

    const plannedTools = TOOL_PLAN[intent]
      .map(findTool)
      .filter((tool): tool is ToolDefinition => tool !== undefined);

    hooks.onPhase?.('PLANNING');
    trace.push({
      id: `${messageId}-plan`,
      label: `Menyusun rencana dengan ${plannedTools.length} tool terdaftar`,
      status: 'SUCCEEDED',
      stage: 'PLAN',
      detail: plannedTools.map((tool) => tool.name).join(', '),
    });

    let evidence: Evidence[] = [];
    let confidence: Confidence | undefined;
    let retrievedDocuments: RetrievedDocument[] | undefined;
    let approval: ApprovalRequest | undefined;

    for (const tool of plannedTools) {
      if (approval) {
        trace.push({
          id: `${messageId}-${tool.id}-held`,
          label: `${tool.name} ditahan sampai persetujuan diberikan`,
          status: 'PENDING',
          stage: 'ACT',
          toolId: tool.id,
        });
        continue;
      }

      const decision = evaluatePolicy(tool.id, actor, {
        approvalThreshold: this.deps.approvalThreshold,
      });

      if (!decision.allowed) {
        trace.push({
          id: `${messageId}-${tool.id}`,
          label: `${tool.name} diblokir oleh kebijakan`,
          status: 'BLOCKED',
          stage: 'ACT',
          toolId: tool.id,
          detail: decision.reason,
        });
        toolsUsed.push({
          toolId: tool.id,
          name: tool.name,
          risk: tool.risk,
          status: 'BLOCKED',
          summary: decision.reason,
        });
        continue;
      }

      if (decision.requiresApproval) {
        approval = await this.deps.approvals.save(
          {
            id: randomUUID(),
            sessionId: request.sessionId,
            toolId: tool.id,
            action: tool.name,
            risk: tool.risk,
            reason: decision.reason,
            requestedBy: actor.id,
            requestedAt: new Date().toISOString(),
            status: 'PENDING',
          },
          actor,
        );

        trace.push({
          id: `${messageId}-${tool.id}`,
          label: `${tool.name} menunggu persetujuan manusia`,
          status: 'AWAITING_APPROVAL',
          stage: 'ACT',
          toolId: tool.id,
          detail: tool.effect,
        });
        toolsUsed.push({
          toolId: tool.id,
          name: tool.name,
          risk: tool.risk,
          status: 'AWAITING_APPROVAL',
          summary: decision.reason,
        });

        logger.audit('approval.requested', {
          approvalId: approval.id,
          toolId: tool.id,
          risk: tool.risk,
          actorId: actor.id,
          sessionId: request.sessionId,
        });
        continue;
      }

      if (tool.id === 'knowledge.search') {
        hooks.onPhase?.('RETRIEVING');
        const retrievalStart = Date.now();
        const retriever = this.deps.retriever;

        // A retriever that reports grounding lets the answer state how well it
        // is supported; a plain one still works, it just says less.
        if (retriever.searchGrounded) {
          const grounded = await retriever.searchGrounded(
            { query: request.message, limit: this.deps.topK },
            actor,
          );
          evidence = grounded.evidence;
          confidence = grounded.confidence;
          retrievedDocuments = grounded.retrievedDocuments;
        } else {
          evidence = await retriever.search(
            { query: request.message, limit: this.deps.topK },
            actor,
          );
        }
        trace.push({
          id: `${messageId}-${tool.id}`,
          label: `${tool.name} menemukan ${evidence.length} bukti yang boleh diakses`,
          status: 'SUCCEEDED',
          stage: 'KNOW',
          toolId: tool.id,
          durationMs: Date.now() - retrievalStart,
        });
        toolsUsed.push({
          toolId: tool.id,
          name: tool.name,
          risk: tool.risk,
          status: 'SUCCEEDED',
          summary: `${evidence.length} dokumen relevan sesuai izin akses`,
        });
        hooks.onEvidence?.(evidence);
        continue;
      }

      hooks.onPhase?.('EXECUTING');
      const result = await this.deps.runtime.execute({
        tool,
        input: { query: request.message },
        actor,
        correlationId: messageId,
      });

      trace.push({
        id: `${messageId}-${tool.id}`,
        label: `${tool.name} dieksekusi pada runtime`,
        status: result.status,
        stage: 'ACT',
        toolId: tool.id,
        detail: result.summary,
        durationMs: result.durationMs,
      });
      toolsUsed.push({
        toolId: tool.id,
        name: tool.name,
        risk: tool.risk,
        status: result.status,
        summary: result.summary,
      });
    }

    hooks.onPhase?.('COMPOSING');
    const completion = await this.compose(
      {
        intent,
        evidence,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...(options.hints && options.hints.length > 0
            ? [{ role: 'system' as const, content: `Konteks layar: ${options.hints.join('; ')}` }]
            : []),
          ...(options.history ?? []),
          { role: 'user', content: request.message },
        ],
      },
      hooks,
    );

    hooks.onPhase?.('VERIFYING');
    trace.push({
      id: `${messageId}-verify`,
      label:
        evidence.length > 0
          ? 'Jawaban diverifikasi terhadap bukti yang dikutip'
          : 'Jawaban ditandai tanpa rujukan enterprise',
      status: evidence.length > 0 ? 'SUCCEEDED' : 'FAILED',
      stage: 'VERIFY',
    });

    const response: AskResponse = {
      messageId,
      sessionId: request.sessionId,
      createdAt: new Date().toISOString(),
      intent,
      answer: completion.text,
      model: completion.model,
      risk: maxRisk(plannedTools.map((tool) => tool.risk)),
      evidence,
      ...(confidence === undefined ? {} : { confidence }),
      ...(retrievedDocuments === undefined ? {} : { retrievedDocuments }),
      trace,
      toolsUsed,
      approval,
      suggestions: completion.suggestions,
    };

    logger.audit('brain.ask', {
      messageId,
      sessionId: request.sessionId,
      actorId: actor.id,
      intent,
      risk: response.risk,
      evidenceCount: evidence.length,
      confidence: confidence?.score,
      toolIds: toolsUsed.map((tool) => tool.toolId),
      approvalId: approval?.id,
      durationMs: Date.now() - startedAt,
      model: completion.model,
    });

    return response;
  }

  /**
   * Produces the answer, streaming it when the configured adapter can and the
   * caller asked for chunks. Falls back to a single completion otherwise, so
   * business logic never depends on a provider's capabilities.
   */
  private async compose(request: LlmRequest, hooks: AskHooks): Promise<LlmResult> {
    const llm = this.deps.llm;
    const canStream = hooks.onAnswerChunk !== undefined && llm.supportsStreaming && llm.stream;

    if (!canStream || !llm.stream) {
      return llm.complete(request);
    }

    let text = '';
    let result: LlmResult | undefined;

    for await (const chunk of llm.stream(request)) {
      if (chunk.text.length > 0) {
        text += chunk.text;
        hooks.onAnswerChunk?.(chunk.text);
      }
      if (chunk.result) result = chunk.result;
    }

    return result ?? { text, model: llm.model, suggestions: [] };
  }

  /**
   * Applies a human decision to a pending approval and, when approved,
   * executes the gated action through the runtime.
   */
  async resolveApproval(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    actor: Actor,
  ): Promise<{ approval: ApprovalRequest; trace: TraceStep[] }> {
    const pending = await this.deps.approvals.get(approvalId, actor);
    if (!pending) {
      throw new Error(`Approval ${approvalId} not found.`);
    }
    if (!actor.scopes.includes('workflow:approve')) {
      throw new Error('Actor is not allowed to decide on approvals.');
    }

    const updated = (await this.deps.approvals.decide(approvalId, decision, actor)) ?? pending;
    const trace: TraceStep[] = [
      {
        id: `${approvalId}-decision`,
        label: `Persetujuan ${decision === 'APPROVED' ? 'diberikan' : 'ditolak'} oleh ${actor.name}`,
        status: decision === 'APPROVED' ? 'SUCCEEDED' : 'BLOCKED',
        stage: 'ACT',
        toolId: updated.toolId,
      },
    ];

    logger.audit('approval.decided', {
      approvalId,
      decision,
      actorId: actor.id,
      toolId: updated.toolId,
      risk: updated.risk,
    });

    if (decision === 'APPROVED') {
      const tool = findTool(updated.toolId);
      if (tool) {
        const result = await this.deps.runtime.execute({
          tool,
          input: { approvalId },
          actor,
          correlationId: approvalId,
          requiresApproval: true,
          approvalId,
        });
        await this.deps.approvals.recordExecution(
          approvalId,
          { status: result.status, summary: result.summary },
          actor,
        );

        trace.push({
          id: `${approvalId}-execution`,
          label: `${tool.name} dieksekusi setelah persetujuan`,
          status: result.status,
          stage: 'VERIFY',
          toolId: tool.id,
          detail: result.summary,
          durationMs: result.durationMs,
        });
      }
    }

    return { approval: updated, trace };
  }
}
