import type { Reranker, ScoredChunk } from '@tania/core/knowledge';
import { tokenize } from '../indexing/embedding';

/** How much each signal may shift a candidate's first-pass score. */
const COVERAGE_WEIGHT = 0.35;
const HEADING_WEIGHT = 0.15;
const PHRASE_WEIGHT = 0.1;
const FRESHNESS_WEIGHT = 0.05;

/** Documents older than this contribute no freshness bonus. */
const FRESHNESS_WINDOW_DAYS = 365;

export interface RerankerOptions {
  /** Injected so ranking stays deterministic in tests. */
  now?: () => Date;
  /**
   * Inverse document frequency, used to weigh term coverage. Without it every
   * query word counts the same, and a passage that only matches a corpus-wide
   * word like "chapter" looks as relevant as one matching "kompensasi".
   */
  idf?: (term: string) => number;
}

/**
 * Second-pass reranking.
 *
 * A first pass optimises recall; this pass optimises precision using signals
 * that are too expensive to compute across the whole index: how much of the
 * question a passage actually covers, whether its heading matches, and how
 * fresh the document is. Deterministic by design, so evaluation fixtures mean
 * something.
 */
export class LexicalReranker implements Reranker {
  readonly id = 'lexical';

  constructor(private readonly options: RerankerOptions = {}) {}

  async rerank(query: string, candidates: ScoredChunk[], limit: number): Promise<ScoredChunk[]> {
    const now = this.options.now?.() ?? new Date();
    const queryTerms = new Set(tokenize(query));
    if (queryTerms.size === 0) return candidates.slice(0, limit);

    const normalizedQuery = query.toLowerCase();

    const rescored = candidates.map((candidate) => {
      // Coverage must be measured over the passage *as indexed* — title,
      // heading, and tags included. Measuring the body alone made a question
      // about "delivery" miss a report whose title is the only place that word
      // appears.
      const textTerms = new Set(
        tokenize(
          [
            candidate.descriptor.title,
            candidate.chunk.heading,
            candidate.chunk.text,
            (candidate.descriptor.tags ?? []).join(' '),
          ].join(' '),
        ),
      );
      const headingTerms = new Set(tokenize(`${candidate.descriptor.title} ${candidate.chunk.heading}`));

      const coverage = weightedCoverage([...queryTerms], textTerms, this.options.idf);
      const headingHit = [...queryTerms].filter((term) => headingTerms.has(term)).length / queryTerms.size;
      const phrase = containsPhrase(candidate.chunk.text.toLowerCase(), normalizedQuery) ? 1 : 0;
      const freshness = freshnessScore(candidate.descriptor.updatedAt, now);

      const score =
        candidate.score +
        COVERAGE_WEIGHT * coverage +
        HEADING_WEIGHT * headingHit +
        PHRASE_WEIGHT * phrase +
        FRESHNESS_WEIGHT * freshness;

      return {
        ...candidate,
        score,
        signals: { ...candidate.signals, coverage, headingHit, phrase, freshness },
      };
    });

    return rescored
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, limit);
  }
}

/**
 * Share of the question's *informative* weight that the passage actually
 * covers. Falls back to plain proportion when no IDF source is wired.
 */
export function weightedCoverage(
  queryTerms: string[],
  passageTerms: Set<string>,
  idf?: (term: string) => number,
): number {
  if (queryTerms.length === 0) return 0;

  if (!idf) {
    const covered = queryTerms.filter((term) => passageTerms.has(term)).length;
    return covered / queryTerms.length;
  }

  let total = 0;
  let matched = 0;

  for (const term of queryTerms) {
    const weight = Math.max(idf(term), 0.01);
    total += weight;
    if (passageTerms.has(term)) matched += weight;
  }

  return total === 0 ? 0 : matched / total;
}

/** True when a multi-word fragment of the question appears verbatim. */
function containsPhrase(text: string, query: string): boolean {
  const words = query.split(/\s+/).filter((word) => word.length > 3);
  if (words.length < 2) return false;

  for (let start = 0; start + 1 < words.length; start += 1) {
    const phrase = `${words[start]} ${words[start + 1]}`;
    if (text.includes(phrase)) return true;
  }
  return false;
}

function freshnessScore(updatedAt: string, now: Date): number {
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(updated)) return 0;

  const ageDays = (now.getTime() - updated) / 86_400_000;
  if (ageDays <= 0) return 1;
  return Math.max(0, 1 - ageDays / FRESHNESS_WINDOW_DAYS);
}
