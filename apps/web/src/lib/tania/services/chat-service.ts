import { TaniaError } from '@tania/config';
import type {
  ChatAction,
  ChatIntent,
  ChatMessage,
  ChatSource,
  ChatState,
  ChatStatus,
  ChatStreamEvent,
  ChatStreamPhase,
  TaniaChatRequest,
  TaniaChatResponse,
} from '@tania/types';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';
import type { TaniaBrain, AskPhase } from '@/lib/tania/brain';
import type { AskResponse } from '@/lib/tania/types';
import type { StoredConversation, TranscriptStore } from '@/lib/tania/transcript/store';
import type { AgentRouter, RoutingDecision } from '@tania/core/orchestration';
import type { ContextService, SessionContext } from './context-service';
import type { IntentService } from './intent-service';
import { AsyncEventQueue } from './event-queue';

export interface ChatHooks {
  onPhase?: (phase: ChatStreamPhase) => void;
  onIntent?: (intent: ChatIntent) => void;
  onSources?: (sources: ChatSource[]) => void;
  onAnswerChunk?: (text: string) => void;
  /** Fired once the turn has a conversation, before the answer exists. */
  onAccepted?: (conversationId: string) => void;
}

export interface ChatServiceDependencies {
  brain: TaniaBrain;
  /** Routes the turn to a specialist; attribution only, for now. */
  agents?: { router: AgentRouter; registry: { list(): unknown[] } };
  context: ContextService;
  intent: IntentService;
  transcript: TranscriptStore;
}

/**
 * The conversational application service.
 *
 * It owns the shape of a turn — resolve context, classify intent, run the
 * Brain, persist, and map to the wire contract — while the Brain keeps owning
 * governance: retrieval permissions, the tool registry, policy, and approvals.
 */
export class TaniaChatService {
  constructor(private readonly deps: ChatServiceDependencies) {}

  async startConversation(actor: Actor, correlationId: string): Promise<{ conversationId: string }> {
    return { conversationId: await this.deps.context.start(actor, correlationId) };
  }

  async loadConversation(
    conversationId: string,
    actor: Actor,
  ): Promise<StoredConversation> {
    return this.deps.transcript.loadConversation(conversationId, actor);
  }

  async chat(
    request: TaniaChatRequest,
    actor: Actor,
    correlationId: string,
    hooks: ChatHooks = {},
  ): Promise<TaniaChatResponse> {
    const startedAt = Date.now();

    // The service and the Brain both report progress; a client should see each
    // phase once, in order.
    let lastPhase: ChatStreamPhase | undefined;
    const reportPhase = (phase: ChatStreamPhase) => {
      if (phase === lastPhase) return;
      lastPhase = phase;
      hooks.onPhase?.(phase);
    };

    const context = await this.deps.context.resolve({
      ...(request.conversationId === undefined ? {} : { conversationId: request.conversationId }),
      actor,
      correlationId,
      ...(request.context === undefined ? {} : { context: request.context }),
    });

    /**
     * Announce the conversation before any work is reported.
     *
     * This has to come before the first phase: a client that is told the
     * conversation id only at `done` learns nothing if the stream is aborted
     * mid-answer, and its next turn silently opens a second conversation.
     */
    hooks.onAccepted?.(context.conversationId);

    reportPhase('UNDERSTANDING');
    const intent = await this.deps.intent.classify(request.message, request.intent);
    hooks.onIntent?.(intent);

    // Routing is deterministic and explainable: it records which specialist the
    // request belongs to, and which of its tools are currently permitted.
    const routing = this.deps.agents?.router.route({
      message: request.message,
      intent: intent.value,
      actor,
    });

    const answer = await this.deps.brain.ask(
      { sessionId: context.conversationId, message: request.message, intent: intent.value },
      actor,
      {
        history: this.deps.context.toLlmHistory(context),
        hints: context.hints,
        hooks: {
          onPhase: (phase) => reportPhase(toStreamPhase(phase)),
          onEvidence: (evidence) => hooks.onSources?.(evidence),
          ...(hooks.onAnswerChunk === undefined ? {} : { onAnswerChunk: hooks.onAnswerChunk }),
        },
      },
    );

    await this.persist(context, request.message, answer, correlationId);

    const response = toChatResponse(answer, context, intent, Date.now() - startedAt, routing);

    logger.info('chat.completed', {
      correlationId,
      conversationId: context.conversationId,
      intent: intent.value,
      state: response.status.state,
      agent: routing?.agent.id,
      sources: response.sources.length,
      durationMs: response.status.durationMs,
    });

    return response;
  }

  /**
   * Same turn, delivered as events.
   *
   * Only progress and answer text cross this boundary — the phase names come
   * from the pipeline itself, and no intermediate reasoning is produced.
   */
  async *stream(
    request: TaniaChatRequest,
    actor: Actor,
    correlationId: string,
  ): AsyncIterable<ChatStreamEvent> {
    const queue = new AsyncEventQueue<ChatStreamEvent>();

    const finished = this.chat(request, actor, correlationId, {
      onAccepted: (conversationId) => queue.push({ type: 'accepted', conversationId }),
      onPhase: (phase) => queue.push({ type: 'phase', phase }),
      onIntent: (intent) => queue.push({ type: 'intent', intent }),
      onSources: (sources) => queue.push({ type: 'sources', sources }),
      onAnswerChunk: (text) => queue.push({ type: 'delta', text }),
    })
      .then((response) => {
        queue.push({ type: 'done', response });
        queue.close();
        return response;
      })
      .catch((error: unknown) => {
        const failure =
          error instanceof TaniaError
            ? { code: error.code, message: error.message }
            : { code: 'INTERNAL', message: 'TANIA tidak dapat menyelesaikan permintaan ini.' };

        logger.error('chat.stream_failed', {
          correlationId,
          code: failure.code,
          message: error instanceof Error ? error.message : String(error),
        });

        queue.push({ type: 'error', ...failure });
        queue.close();
        return undefined;
      });

    yield* queue;
    await finished;
  }

  private async persist(
    context: SessionContext,
    question: string,
    answer: AskResponse,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.deps.transcript.recordTurn(
        context.conversationId,
        { messageId: answer.messageId, question, response: answer },
        context.actor,
      );
    } catch (error) {
      // Best effort by design: the user keeps their answer even if the store is down.
      logger.warn('chat.turn_not_persisted', {
        correlationId,
        conversationId: context.conversationId,
        messageId: answer.messageId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const PHASE_BY_STAGE: Record<AskPhase, ChatStreamPhase> = {
  UNDERSTANDING: 'UNDERSTANDING',
  RETRIEVING: 'RETRIEVING',
  PLANNING: 'PLANNING',
  EXECUTING: 'EXECUTING',
  COMPOSING: 'COMPOSING',
  VERIFYING: 'VERIFYING',
};

function toStreamPhase(phase: AskPhase): ChatStreamPhase {
  return PHASE_BY_STAGE[phase];
}

/** Maps the Brain's answer onto the conversational wire contract. */
export function toChatResponse(
  answer: AskResponse,
  context: SessionContext,
  intent: ChatIntent,
  durationMs: number,
  routing?: RoutingDecision,
): TaniaChatResponse {
  const message: ChatMessage = {
    id: answer.messageId,
    conversationId: context.conversationId,
    role: 'tania',
    content: answer.answer,
    createdAt: answer.createdAt,
  };

  const status: ChatStatus = {
    state: toChatState(answer),
    risk: answer.risk,
    trace: answer.trace,
    durationMs,
    model: answer.model,
    grounded: answer.evidence.length > 0,
    ...(answer.confidence === undefined ? {} : { confidence: answer.confidence }),
    ...(answer.retrievedDocuments === undefined
      ? {}
      : { retrievedDocuments: answer.retrievedDocuments }),
    ...(routing === undefined
      ? {}
      : {
          agent: {
            id: routing.agent.id,
            name: routing.agent.name,
            domain: routing.agent.domain,
            rationale: routing.rationale,
            confidence: routing.confidence,
            fallback: routing.fallback,
            toolPlan: routing.toolPlan,
          },
        }),
  };

  return { message, intent, sources: answer.evidence, actions: toActions(answer), status };
}

function toChatState(answer: AskResponse): ChatState {
  if (answer.approval && answer.approval.status === 'PENDING') return 'AWAITING_APPROVAL';
  if (answer.toolsUsed.some((tool) => tool.status === 'BLOCKED')) return 'BLOCKED';
  if (answer.toolsUsed.some((tool) => tool.status === 'FAILED')) return 'FAILED';
  return 'COMPLETED';
}

function toActions(answer: AskResponse): ChatAction[] {
  const actions: ChatAction[] = [];

  if (answer.approval) {
    actions.push({
      id: `approval:${answer.approval.id}`,
      type: 'APPROVAL',
      label: `Setujui: ${answer.approval.action}`,
      risk: answer.approval.risk,
      status: answer.approval.status,
      approvalId: answer.approval.id,
      detail: answer.approval.reason,
    });
  }

  for (const tool of answer.toolsUsed) {
    actions.push({
      id: `tool:${tool.toolId}`,
      type: 'TOOL',
      label: tool.name,
      risk: tool.risk,
      status: tool.status,
      detail: tool.summary,
    });
  }

  for (const [index, suggestion] of answer.suggestions.entries()) {
    actions.push({
      id: `suggestion:${index}`,
      type: 'SUGGESTION',
      label: suggestion,
      prompt: suggestion,
    });
  }

  return actions;
}
