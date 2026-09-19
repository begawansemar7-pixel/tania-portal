import type { JarvisCapabilityStatus } from '@tania/types';
import { config } from '@/lib/config/env';
import { processSingleton } from './process-state';
import { logger } from '@/lib/logger';
import { createIdentityProvider } from '@/lib/identity/oidc-identity';
import type { Actor, IdentityProvider } from '@/lib/identity/types';
import { TaniaBrain } from './brain';
import { createLlmProvider } from './llm';
import { createKnowledgeStack } from '@/lib/knowledge';
import { createAgentStack } from '@/lib/agents';
import { createJarvisRuntime } from './runtime/jarvis';
import { JarvisClient } from './runtime/client';
import { createApiClient } from './api/client';
import { InMemoryApprovalStore, type ApprovalStore } from './approvals/store';
import { HttpApprovalStore } from './approvals/http-store';
import { InMemoryTranscriptStore, type TranscriptStore } from './transcript/store';
import { HttpTranscriptStore } from './transcript/http-store';
import { ContextService } from './services/context-service';
import { IntentService, KeywordIntentClassifier } from './services/intent-service';
import { TaniaChatService } from './services/chat-service';
import { createOrchestrationStack } from '@/lib/orchestration';
import { DetectorInsightService } from '@/lib/insights';
import {
  GovernanceRecorder,
  InMemoryGovernanceSink,
  type GovernanceSink,
  TaskEvaluator,
  eventFromTask,
} from '@/lib/governance';
import { ClearanceAndAclEvaluator } from '@/lib/knowledge';
import { ENTERPRISE_DOCUMENTS } from '@/lib/knowledge/corpus/enterprise-documents';
import { HttpGovernanceSink, HttpMemoryStore, HttpTaskStore } from '@/lib/tania/durable/stores';
import { INITIATIVES, KPIS, RISKS } from '@/lib/portal/mock/fixtures';

/**
 * Composition root. Every dependency is constructed once and injected, so an
 * adapter can be replaced without touching the Brain or the route handlers.
 */
const apiClient = createApiClient();

if (!apiClient) {
  logger.warn('persistence.not_configured', {
    reason:
      'TANIA_API_BASE_URL is not set. Approvals live in memory for this process only and no transcript is stored.',
  });
}

/**
 * The in-memory fallbacks are anchored to the process, not to the module.
 *
 * Without that, an approval opened by a route handler is invisible to the page
 * that renders the approval list — Next bundles them separately, so each holds
 * its own instance. The HTTP-backed stores need no such care: PostgreSQL is
 * already the shared thing.
 */
const approvals: ApprovalStore = apiClient
  ? new HttpApprovalStore(apiClient)
  : processSingleton('approvals', () => new InMemoryApprovalStore());

const transcript: TranscriptStore = apiClient
  ? new HttpTranscriptStore(apiClient)
  : processSingleton('transcript', () => new InMemoryTranscriptStore());

const llmProvider = createLlmProvider(config);

/**
 * The knowledge pipeline. Retrieval is permission-aware and grounded: it
 * returns citations plus a confidence the Brain can refuse to answer on.
 */
const knowledge = createKnowledgeStack({ llm: llmProvider });

/**
 * Specialist agents and the router that picks between them. Agents reach the
 * world only through the governed tool invoker, never the runtime directly.
 */
const agents = createAgentStack();

/**
 * The JARVIS boundary. Everything that reaches the runtime — the Brain, the
 * agents, the orchestrator — goes through this one adapter, so timeout, retry,
 * cancellation and the last-mile approval check apply everywhere.
 */
const runtime = createJarvisRuntime(config);

/** Typed access to the ten runtime capabilities, for callers beyond tools. */
const jarvis = new JarvisClient(runtime.adapter);

const brain = new TaniaBrain({
  llm: llmProvider,
  retriever: knowledge.retriever,
  runtime,
  approvals,
  topK: config.rag.topK,
  approvalThreshold: config.governance.approvalThreshold,
});

/**
 * Who the portal believes is asking.
 *
 * `mock` is development only and cannot reach production — `resolveAuth`
 * refuses that combination when configuration is read.
 */
const identity: IdentityProvider = createIdentityProvider(config);

const contextService = new ContextService(transcript);

/**
 * Keyword classification by default: deterministic, free, and always
 * available. Swap in `LlmIntentClassifier` here to have the configured
 * provider decide instead — no other file changes.
 */
const intentService = new IntentService(new KeywordIntentClassifier());

/**
 * The task orchestrator. It reuses the same agents, approval store, runtime and
 * retriever as the conversational path — one governance plane, two entrances.
 */
const orchestration = processSingleton('orchestration', () =>
  createOrchestrationStack({
    agents,
    intents: intentService,
    approvals,
    runtime,
    retriever: knowledge.retriever,
    ...(apiClient ? { tasks: new HttpTaskStore(apiClient), memory: new HttpMemoryStore(apiClient) } : {}),
  }),
);

/**
 * Proactive insights.
 *
 * Detectors observe and propose; they hold no tools and cannot start work.
 * Anything they suggest re-enters through the ordinary task path, so
 * proactivity adds no second route into enterprise systems.
 */
const documentPermissions = new ClearanceAndAclEvaluator();

/**
 * The governance trail.
 *
 * PostgreSQL when a backend is configured. The in-memory sink remains for
 * development, where there is no backend to talk to — it reports
 * `durable: false`, and `/api/ready` refuses traffic on that basis, so an
 * instance keeping the trail in memory never quietly passes for one that is
 * keeping it properly.
 */
const governanceSink: GovernanceSink = apiClient
  ? new HttpGovernanceSink(apiClient)
  : processSingleton('governance-sink', () => new InMemoryGovernanceSink());
const governance = new GovernanceRecorder(governanceSink);
const evaluator = new TaskEvaluator();

const insights = processSingleton('insights', () => new DetectorInsightService({
  kpis: async () => [...KPIS],
  initiatives: async () => [...INITIATIVES],
  risks: async () => [...RISKS],
  // Filtered before the detector sees them: a headline is a disclosure too.
  documents: async (actor) =>
    ENTERPRISE_DOCUMENTS.filter((document) => documentPermissions.canRead(actor, document.acl).allowed),
  tasks: async (actor) => orchestration.tasks.list(actor, 20),
}));

const chatService = new TaniaChatService({
  brain,
  agents,
  context: contextService,
  intent: intentService,
  transcript,
});

export function getBrain(): TaniaBrain {
  return brain;
}

export function getApprovalStore(): ApprovalStore {
  return approvals;
}

export function getTranscriptStore(): TranscriptStore {
  return transcript;
}

export function getIdentityProvider(): IdentityProvider {
  return identity;
}

export function getKnowledge() {
  return knowledge;
}

export function getAgents() {
  return agents;
}

export function getChatService(): TaniaChatService {
  return chatService;
}

export function getJarvisRuntime() {
  return runtime;
}

export function getJarvisClient(): JarvisClient {
  return jarvis;
}

export function getGovernance(): GovernanceRecorder {
  return governance;
}

export function getGovernanceSink(): GovernanceSink {
  return governanceSink;
}

export function getEvaluator(): TaskEvaluator {
  return evaluator;
}

/** One governance record per finished task, written where tasks settle. */
export async function recordTaskGovernance(
  task: Parameters<typeof eventFromTask>[0],
  correlationId: string,
  actor: Actor,
): Promise<void> {
  await governance.record(eventFromTask(task, correlationId, actor.id), actor);
}

export function getInsights(): DetectorInsightService {
  return insights;
}

export function getOrchestrator() {
  return orchestration.orchestrator;
}

export function getTaskStore() {
  return orchestration.tasks;
}

export function getContextService(): ContextService {
  return contextService;
}

export function getIntentService(): IntentService {
  return intentService;
}

export interface PersistenceStatus {
  backendConfigured: boolean;
  approvalStore: string;
  approvalsDurable: boolean;
  transcriptStore: string;
  transcriptDurable: boolean;
  authMode: string;
  identityProvider: string;
  /** False when this deployment would authenticate nobody. */
  authSecure: boolean;
  intentClassifier: string;
  llmProvider: string;
  retriever: string;
  embeddingModel: string;
  agentRouter: string;
  agentCount: number;
  orchestrator: string;
  taskStore: string;
  runtimeAdapter: string;
  /** Per-capability truth about what is live and what is simulated. */
  runtimeCapabilities: JarvisCapabilityStatus[];
  governanceSink: string;
  governanceDurable: boolean;
}

/** Surfaced in Settings so it is obvious whether governance state is durable. */
export function getPersistenceStatus(): PersistenceStatus {
  return {
    backendConfigured: apiClient !== undefined,
    approvalStore: approvals.id,
    approvalsDurable: approvals.durable,
    transcriptStore: transcript.id,
    transcriptDurable: transcript.durable,
    authMode: config.auth.mode,
    identityProvider: identity.id,
    authSecure: !config.auth.insecure,
    intentClassifier: intentService.id,
    llmProvider: llmProvider.id,
    retriever: knowledge.retriever.id,
    embeddingModel: knowledge.embeddingModel,
    agentRouter: agents.router.id,
    agentCount: agents.registry.list().length,
    orchestrator: orchestration.orchestrator.id,
    taskStore: orchestration.tasks.id,
    runtimeAdapter: runtime.id,
    runtimeCapabilities: runtime.describe(),
    governanceSink: governanceSink.id,
    governanceDurable: governance.durable,
  };
}
