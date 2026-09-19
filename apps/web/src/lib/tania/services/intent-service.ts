import type { ChatIntent, Intent } from '@tania/types';
import type { IntentClassifier } from '@tania/core/intent';
import { classifyIntentSignal } from '@/lib/tania/intent';
import type { LlmProvider } from '@/lib/tania/llm';

/**
 * Deterministic keyword classifier — the default.
 *
 * Costs nothing, never fails, and is fully testable. Whatever it decides, the
 * policy layer still runs: a wrong intent changes which tools are *planned*,
 * never whether they are *allowed*.
 */
export class KeywordIntentClassifier implements IntentClassifier {
  readonly id = 'keyword';

  classify(message: string) {
    const signal = classifyIntentSignal(message);

    return {
      intent: signal.intent,
      confidence: signal.confidence,
      ...(signal.matched.length > 0
        ? { signal: `cocok: ${signal.matched.slice(0, 3).join(', ')}` }
        : { signal: 'tidak ada kata kunci yang cocok' }),
    };
  }
}

/**
 * Model-backed classifier, for deployments that want one.
 *
 * Asks the configured provider for a single label and falls back to the keyword
 * classifier on anything unexpected — an unavailable model must not stop a
 * conversation.
 */
export class LlmIntentClassifier implements IntentClassifier {
  readonly id = 'llm';
  private readonly fallback = new KeywordIntentClassifier();

  constructor(private readonly llm: LlmProvider) {}

  async classify(message: string) {
    try {
      const result = await this.llm.complete({
        intent: 'CONVERSE',
        evidence: [],
        maxTokens: 8,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Klasifikasikan permintaan pengguna ke salah satu label berikut dan jawab hanya dengan label itu: ANALYZE, CREATE, SEARCH, AUTOMATE, CONVERSE.',
          },
          { role: 'user', content: message },
        ],
      });

      const label = result.text.trim().toUpperCase();
      const intents: Intent[] = ['ANALYZE', 'CREATE', 'SEARCH', 'AUTOMATE', 'CONVERSE'];
      const matched = intents.find((intent) => label.startsWith(intent));

      return matched
        ? { intent: matched, confidence: 0.8, signal: 'diklasifikasikan oleh model' }
        : this.fallback.classify(message);
    } catch {
      return this.fallback.classify(message);
    }
  }
}

/**
 * Intent classification as a service.
 *
 * The classifier is injected, so swapping keyword for model-backed is a
 * configuration change. An explicit user choice always wins over inference.
 */
export class IntentService {
  constructor(private readonly classifier: IntentClassifier) {}

  get id(): string {
    return this.classifier.id;
  }

  async classify(message: string, chosen?: Intent): Promise<ChatIntent> {
    if (chosen) {
      return { value: chosen, confidence: 1, signal: 'dipilih pengguna' };
    }

    const classification = await this.classifier.classify(message);

    return {
      value: classification.intent,
      confidence: classification.confidence,
      ...(classification.signal === undefined ? {} : { signal: classification.signal }),
    };
  }
}
