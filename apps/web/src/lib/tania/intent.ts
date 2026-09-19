import type { Intent } from './types';

const KEYWORDS: Record<Exclude<Intent, 'CONVERSE'>, string[]> = {
  ANALYZE: ['analisis', 'analisa', 'analyze', 'tren', 'trend', 'bandingkan', 'compare', 'kinerja', 'performance', 'insight', 'metrik'],
  CREATE: ['buat', 'buatkan', 'draft', 'draf', 'susun', 'tulis', 'create', 'generate', 'proposal', 'laporan', 'dokumen'],
  AUTOMATE: ['otomatis', 'otomasi', 'automate', 'workflow', 'jalankan', 'execute', 'schedule', 'jadwalkan', 'kirim', 'broadcast'],
  SEARCH: ['cari', 'carikan', 'temukan', 'search', 'find', 'dimana', 'apa itu', 'kebijakan', 'policy', 'dokumen'],
};

export interface IntentSignal {
  intent: Intent;
  /** 0–1, derived from how many distinct keywords matched. */
  confidence: number;
  /** Keywords that drove the decision; user-safe, never a rationale. */
  matched: string[];
}

/** Confidence ceiling for the keyword classifier: it is a heuristic, not a model. */
const MAX_KEYWORD_CONFIDENCE = 0.9;

/**
 * Lightweight deterministic classifier.
 *
 * Runs before any tool planning, so the controlled capability in play is
 * decided without a model call — and the policy layer always runs regardless
 * of how confident this is.
 */
export function classifyIntentSignal(message: string): IntentSignal {
  const normalized = message.toLowerCase();

  const scores = (Object.keys(KEYWORDS) as Array<Exclude<Intent, 'CONVERSE'>>).map((intent) => {
    const matched = KEYWORDS[intent].filter((keyword) => normalized.includes(keyword));
    return { intent, matched };
  });

  const best = scores.reduce((a, b) => (b.matched.length > a.matched.length ? b : a));

  if (best.matched.length === 0) {
    return { intent: 'CONVERSE', confidence: 0.35, matched: [] };
  }

  const confidence = Math.min(MAX_KEYWORD_CONFIDENCE, 0.5 + best.matched.length * 0.15);
  return { intent: best.intent, confidence: Number(confidence.toFixed(2)), matched: best.matched };
}

export function classifyIntent(message: string): Intent {
  return classifyIntentSignal(message).intent;
}
