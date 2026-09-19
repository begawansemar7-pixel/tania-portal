import type { Confidence } from '@tania/types';
import type { ScoredChunk } from '@tania/core/knowledge';

export interface GroundingDecision {
  grounded: boolean;
  confidence: Confidence;
}

export interface GroundingOptions {
  /** Top score required before an answer may assert facts. */
  minScore: number;
  /**
   * Share of the question's content terms that must actually appear in the top
   * passage. Score alone is not enough: a weak-but-best match still ranks
   * first, and without this an unrelated question gets a confident answer.
   */
  minCoverage?: number;
}

export const DEFAULT_MIN_COVERAGE = 0.2;

/**
 * How informative the question itself is, 0–1.
 *
 * A question made only of words that appear everywhere ("chapter") cannot
 * support a confident answer no matter how well a passage matches it, because
 * the match carries almost no information.
 */
export interface QuerySignal {
  informativeness: number;
}

/**
 * Decides whether retrieval found enough to answer from.
 *
 * This is the guard against confident nonsense: below the threshold the
 * service must say it found nothing rather than let a model fill the gap.
 * Confidence blends three things a reader would also weigh — how strong the
 * best match is, how far ahead of the runner-up it is, and how many
 * independent documents agree.
 */
export function evaluateGrounding(
  candidates: ScoredChunk[],
  options: GroundingOptions & Partial<QuerySignal>,
): GroundingDecision {
  const informativeness = clamp(options.informativeness ?? 1);
  if (candidates.length === 0) {
    return {
      grounded: false,
      confidence: {
        score: 0,
        level: 'NONE',
        rationale: 'Tidak ada dokumen yang cocok dan dapat Anda akses.',
      },
    };
  }

  const top = candidates[0]?.score ?? 0;
  const second = candidates[1]?.score ?? 0;
  const coverage = candidates[0]?.signals?.coverage ?? 0;
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;

  if (coverage < minCoverage) {
    return {
      grounded: false,
      confidence: {
        score: 0,
        level: 'NONE',
        rationale:
          'Dokumen yang tersedia tidak membahas istilah pada pertanyaan ini.',
      },
    };
  }
  const documents = new Set(candidates.map((candidate) => candidate.chunk.documentId));

  if (top < options.minScore) {
    return {
      grounded: false,
      confidence: {
        score: Number(top.toFixed(2)),
        level: 'NONE',
        rationale: `Kecocokan tertinggi ${(top * 100).toFixed(0)}% berada di bawah ambang ${(options.minScore * 100).toFixed(0)}%.`,
      },
    };
  }

  const margin = top === 0 ? 0 : Math.min(1, (top - second) / top);
  const agreement = Math.min(1, documents.size / 3);
  const raw = clamp(0.6 * normalize(top) + 0.2 * margin + 0.2 * agreement);
  const score = clamp(raw * informativeness);

  const support =
    documents.size > 1
      ? `${documents.size} dokumen mendukung jawaban ini.`
      : 'Satu dokumen mendukung jawaban ini.';

  return {
    grounded: true,
    confidence: {
      score: Number(score.toFixed(2)),
      level: score >= 0.7 ? 'HIGH' : score >= 0.45 ? 'MEDIUM' : 'LOW',
      rationale:
        informativeness < 0.6
          ? `${support} Pertanyaan memakai istilah yang umum di korpus, jadi keyakinan ditahan.`
          : support,
    },
  };
}

/** Fused scores sit well below 1; rescale so confidence reads sensibly. */
function normalize(score: number): number {
  return clamp(score / 0.8);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
