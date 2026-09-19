/**
 * Intent domain — what the user is asking for.
 *
 * Classification runs before any tool is planned, so the controlled capability
 * in play is decided without a model call.
 */
import type { Intent } from '@tania/types';
import type { RequestContext } from '../context/index.js';

export interface IntentClassification {
  intent: Intent;
  /** 0–1. Low confidence should widen the plan, never skip the policy layer. */
  confidence: number;
  /** Short, user-safe label such as "matched: workflow keywords". */
  signal?: string;
}

export interface IntentClassifier {
  readonly id: string;
  classify(
    message: string,
    context?: RequestContext,
  ): Promise<IntentClassification> | IntentClassification;
}
