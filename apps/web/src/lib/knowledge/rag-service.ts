import type { Citation, Confidence, RagResponse, RetrievedDocument } from '@tania/types';
import type {
  CitationService,
  GroundedRetrieval,
  KnowledgeRetriever,
  Reranker,
  Retriever,
  RetrievalQuery,
  ScoredChunk,
} from '@tania/core/knowledge';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';
import type { LlmProvider } from '@/lib/tania/llm';
import { evaluateGrounding } from './retrieval/grounding-policy';
import { tokenize } from './indexing/embedding';
import { toRetrievedDocuments } from './citations/citation-service';

export interface RagServiceDependencies {
  /** Awaited before every retrieval, so a cold process indexes exactly once. */
  ready?: () => Promise<void>;
  /** Inverse document frequency, used to judge how informative a question is. */
  idf?: (term: string) => number;
  retriever: Retriever;
  reranker: Reranker;
  citations: CitationService;
  llm: LlmProvider;
  topK: number;
  minScore: number;
}

export interface RagRetrieval extends GroundedRetrieval {
  citations: Citation[];
  /** Ranked passages, kept so a caller can verify what the answer used. */
  chunks: ScoredChunk[];
}

/** Said verbatim when retrieval finds nothing worth answering from. */
export const NO_SOURCE_ANSWER =
  'Saya tidak menemukan dokumen yang relevan dan boleh Anda akses untuk pertanyaan ini, jadi saya tidak dapat menjawabnya dari pengetahuan enterprise. Persempit pertanyaan, sebutkan nama dokumen, atau minta akses bila Anda yakin dokumennya ada.';

/**
 * Retrieval-augmented answering.
 *
 * The contract it enforces: an answer either rests on retrieved passages that
 * the actor may read, or it says plainly that it has none. There is no third
 * path in which the model fills a gap on its own.
 */
export class RagService {
  constructor(private readonly deps: RagServiceDependencies) {}

  /** Retrieval, reranking, grounding, and citations — without composing prose. */
  async retrieve(
    query: RetrievalQuery,
    actor: Actor,
  ): Promise<RagRetrieval> {
    await this.deps.ready?.();

    const limit = query.limit || this.deps.topK;

    const candidates = await this.deps.retriever.retrieve(
      {
        query: query.query,
        limit,
        ...(query.classificationCeiling === undefined
          ? {}
          : { classificationCeiling: query.classificationCeiling }),
      },
      actor,
    );

    const ranked = await this.deps.reranker.rerank(query.query, candidates, limit);
    const { grounded, confidence } = evaluateGrounding(ranked, {
      minScore: this.deps.minScore,
      informativeness: this.informativeness(query.query),
    });

    const citations = grounded ? this.deps.citations.build(ranked) : [];
    const citedIds = new Set(citations.map((citation) => citation.id));
    const retrievedDocuments = toRetrievedDocuments(ranked, citedIds);

    logger.info('rag.retrieved', {
      actorId: actor.id,
      candidates: candidates.length,
      ranked: ranked.length,
      grounded,
      confidence: confidence.score,
      documents: retrievedDocuments.length,
    });

    return {
      evidence: citations,
      citations,
      confidence,
      retrievedDocuments,
      grounded,
      chunks: ranked,
    };
  }

  /**
   * How much information the question itself carries, 0–1.
   *
   * Used to hold confidence back on questions built entirely from words the
   * corpus repeats everywhere.
   */
  private informativeness(query: string): number {
    const idf = this.deps.idf;
    if (!idf) return 1;

    const terms = tokenize(query);
    if (terms.length === 0) return 0;

    const mean = terms.reduce((sum, term) => sum + idf(term), 0) / terms.length;
    return Math.min(1, mean / REFERENCE_IDF);
  }

  /**
   * Full RAG answer.
   *
   * When retrieval is not grounded the model is never called: there is nothing
   * for it to be faithful to, and asking it anyway is how hallucinations get in.
   */
  async answer(query: RetrievalQuery, actor: Actor): Promise<RagResponse> {
    const retrieval = await this.retrieve(query, actor);

    if (!retrieval.grounded) {
      return {
        answer: NO_SOURCE_ANSWER,
        citations: [],
        confidence: retrieval.confidence,
        retrievedDocuments: retrieval.retrievedDocuments,
      };
    }

    const completion = await this.deps.llm.complete({
      intent: 'SEARCH',
      evidence: retrieval.citations,
      temperature: 0,
      messages: [
        { role: 'system', content: groundingPrompt(retrieval.citations) },
        { role: 'user', content: query.query },
      ],
    });

    const { answer, dropped } = enforceCitationMarkers(completion.text, retrieval.citations);

    if (dropped.length > 0) {
      logger.warn('rag.unsupported_markers_dropped', {
        actorId: actor.id,
        markers: dropped,
        available: retrieval.citations.length,
      });
    }

    return {
      answer,
      citations: retrieval.citations,
      confidence: retrieval.confidence,
      retrievedDocuments: retrieval.retrievedDocuments,
    };
  }
}

/** Reference IDF: a term appearing in roughly a sixth of the corpus. */
const REFERENCE_IDF = 2;

/** Instruction that keeps composition tied to the retrieved passages. */
export function groundingPrompt(citations: Citation[]): string {
  const sources = citations
    .map((citation) => `[${citation.marker}] ${citation.title} — ${citation.locator}: ${citation.snippet}`)
    .join('\n');

  return [
    'Jawab hanya menggunakan kutipan di bawah ini.',
    'Tandai setiap klaim dengan nomor sumbernya, contoh [1].',
    'Bila kutipan tidak memuat jawabannya, katakan bahwa informasinya tidak tersedia.',
    'Jangan menambahkan fakta, angka, atau nama yang tidak ada pada kutipan.',
    '',
    'Kutipan:',
    sources,
  ].join('\n');
}

/**
 * Removes references to sources that do not exist.
 *
 * A marker pointing at nothing is an unsupported claim wearing a citation's
 * clothes, so it is stripped rather than rendered.
 */
export function enforceCitationMarkers(
  text: string,
  citations: Citation[],
): { answer: string; dropped: number[] } {
  const valid = new Set(citations.map((citation) => citation.marker));
  const dropped: number[] = [];

  const answer = text.replace(/\[(\d{1,2})\]/g, (match, raw: string) => {
    const marker = Number.parseInt(raw, 10);
    if (valid.has(marker)) return match;
    dropped.push(marker);
    return '';
  });

  return { answer: answer.replace(/[ \t]{2,}/g, ' ').trimEnd(), dropped };
}

/**
 * Adapts the RAG service to the retriever port the Brain consumes, so the
 * conversational pipeline gains grounding without knowing how it is produced.
 */
export class RagKnowledgeRetriever implements KnowledgeRetriever {
  readonly id = 'rag';

  constructor(private readonly rag: RagService) {}

  async search(query: RetrievalQuery, actor: Actor) {
    return (await this.rag.retrieve(query, actor)).evidence;
  }

  async searchGrounded(query: RetrievalQuery, actor: Actor): Promise<GroundedRetrieval> {
    const retrieval = await this.rag.retrieve(query, actor);

    return {
      evidence: retrieval.evidence,
      confidence: retrieval.confidence,
      retrievedDocuments: retrieval.retrievedDocuments as RetrievedDocument[],
      grounded: retrieval.grounded,
    };
  }
}

export type { Confidence };
