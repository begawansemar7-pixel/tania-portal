/**
 * Conversational contract for `POST /api/tania/chat`.
 *
 * Governance rule that shapes this file: nothing here carries hidden
 * reasoning. `ChatStatus.trace` reports safe execution status only, and
 * `ChatMessage.content` is the final answer — never intermediate deliberation.
 */
import type { Evidence } from './evidence.js';
import type { Intent } from './intent.js';
import type { Confidence, RetrievedDocument } from './rag.js';
import type { RiskLevel } from './risk.js';
import type { TraceStep } from './trace.js';

export type ChatRole = 'user' | 'tania';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ChatIntent {
  value: Intent;
  /** 0–1. Low confidence widens the plan; it never skips the policy layer. */
  confidence: number;
  /** Short, user-safe explanation such as "cocok: kata kunci workflow". */
  signal?: string;
}

/** A source the answer is grounded in. */
export type ChatSource = Evidence;

export const CHAT_ACTION_TYPES = ['APPROVAL', 'TOOL', 'SUGGESTION'] as const;

export type ChatActionType = (typeof CHAT_ACTION_TYPES)[number];

/**
 * Something the user can act on: a gate to decide, a tool that ran, or a
 * follow-up to ask next.
 */
export interface ChatAction {
  id: string;
  type: ChatActionType;
  label: string;
  /** Present for APPROVAL and TOOL actions. */
  risk?: RiskLevel;
  /** Execution or decision status, mirroring the trace vocabulary. */
  status?: string;
  /** Present for APPROVAL actions; the gate to decide on. */
  approvalId?: string;
  /** Present for SUGGESTION actions; the prompt to send next. */
  prompt?: string;
  detail?: string;
}

export const CHAT_STATES = [
  'COMPLETED',
  'AWAITING_APPROVAL',
  'BLOCKED',
  'FAILED',
] as const;

export type ChatState = (typeof CHAT_STATES)[number];

export interface ChatStatus {
  state: ChatState;
  /** Highest risk among the planned capabilities. */
  risk: RiskLevel;
  /** Safe execution status per step. Never chain-of-thought. */
  trace: TraceStep[];
  durationMs: number;
  model: string;
  /** True when the answer is backed by at least one citation. */
  grounded: boolean;
  /** Retrieval confidence, when knowledge was consulted. */
  confidence?: Confidence;
  /** Documents considered during retrieval, cited or not. */
  retrievedDocuments?: RetrievedDocument[];
  /** Specialist agent the request was routed to. */
  agent?: ChatAgentAttribution;
}

/** Which specialist handled the turn, and why it was chosen. */
export interface ChatAgentAttribution {
  id: string;
  name: string;
  domain: string;
  /** User-safe explanation of the routing decision. */
  rationale: string;
  confidence: number;
  /** True when no specialist matched and the default agent answered. */
  fallback: boolean;
  /** Tools this agent may use for the request, after permission filtering. */
  toolPlan: string[];
}

/** Caller-supplied context about where the question came from. */
export interface ChatContext {
  /** Route or screen the user asked from, e.g. "/dashboard". */
  surface?: string;
  /** Entity currently in view, e.g. { type: "initiative", id: "DPS-118" }. */
  focus?: { type: string; id: string };
  /** BCP-47 tag; drives the language of the answer. */
  locale?: string;
  /** Free-form, small, non-sensitive hints from the screen. */
  attributes?: Record<string, string>;
}

export interface TaniaChatRequest {
  message: string;
  /** Omit to start a new conversation; the response returns the new id. */
  conversationId?: string;
  context?: ChatContext;
  /** Hint only — the service still classifies and still applies policy. */
  intent?: Intent;
  /** Ask for Server-Sent Events instead of a single JSON body. */
  stream?: boolean;
}

export interface TaniaChatResponse {
  message: ChatMessage;
  intent: ChatIntent;
  sources: ChatSource[];
  actions: ChatAction[];
  status: ChatStatus;
}

// ── Streaming ────────────────────────────────────────────────────────────────

export const CHAT_STREAM_PHASES = [
  'UNDERSTANDING',
  'RETRIEVING',
  'PLANNING',
  'EXECUTING',
  'COMPOSING',
  'VERIFYING',
] as const;

export type ChatStreamPhase = (typeof CHAT_STREAM_PHASES)[number];

/**
 * Server-sent event payloads, in the order a client can expect them:
 * `accepted` → `phase`* → `intent` → `sources` → `delta`* → `done`,
 * with `error` replacing everything after the point of failure.
 *
 * `accepted` carries no `messageId`: it is emitted as soon as the turn has a
 * conversation to belong to, which is before the answer — and therefore its
 * message — exists. Its purpose is to let a client record where the turn lives
 * straight away, so a stream that is aborted mid-answer can still be resumed
 * rather than silently starting a second conversation on the next turn.
 */
export type ChatStreamEvent =
  | { type: 'accepted'; conversationId: string; messageId?: string }
  | { type: 'phase'; phase: ChatStreamPhase; detail?: string }
  | { type: 'intent'; intent: ChatIntent }
  | { type: 'sources'; sources: ChatSource[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; response: TaniaChatResponse }
  | { type: 'error'; code: string; message: string };

export function isChatState(value: unknown): value is ChatState {
  return typeof value === 'string' && (CHAT_STATES as readonly string[]).includes(value);
}
