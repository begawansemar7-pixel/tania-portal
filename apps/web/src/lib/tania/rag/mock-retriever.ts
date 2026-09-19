import { KNOWLEDGE_DOCUMENTS, type KnowledgeDocument } from '@/lib/data/knowledge';
import type { Actor } from '@/lib/identity/types';
import type { Classification, Evidence } from '@/lib/tania/types';
import { ClearanceAndAclEvaluator } from '@/lib/knowledge/permissions/permission-evaluator';
import type { KnowledgeRetriever, RetrievalQuery } from './retriever';

/**
 * Clearance check, delegated to the knowledge permission evaluator so there is
 * one implementation of "may this actor read this" in the portal.
 */
export function canRead(actor: Actor, classification: Classification): boolean {
  return PERMISSIONS.canRead(actor, { classification }).allowed;
}

const PERMISSIONS = new ClearanceAndAclEvaluator();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 2);
}

function scoreDocument(document: KnowledgeDocument, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = tokenize(
    [document.title, document.summary, document.body, document.keywords.join(' ')].join(' '),
  );
  const matches = tokens.filter((token) =>
    haystack.some((word) => word === token || word.startsWith(token)),
  );
  return matches.length / tokens.length;
}

function toEvidence(document: KnowledgeDocument, score: number): Evidence {
  return {
    id: document.id,
    title: document.title,
    source: document.source,
    snippet: document.summary,
    classification: document.classification,
    updatedAt: document.updatedAt,
    score: Number(score.toFixed(2)),
    url: document.url,
  };
}

/**
 * Permission-aware lexical retriever over the seed corpus.
 * Documents above the actor clearance are filtered out before scoring, so
 * they can never leak into a generated answer.
 */
export class MockKnowledgeRetriever implements KnowledgeRetriever {
  readonly id = 'mock';

  constructor(private readonly documents: readonly KnowledgeDocument[] = KNOWLEDGE_DOCUMENTS) {}

  async search({ query, limit }: RetrievalQuery, actor: Actor): Promise<Evidence[]> {
    const tokens = tokenize(query);

    return this.documents
      .filter((document) => canRead(actor, document.classification))
      .map((document) => ({ document, score: scoreDocument(document, tokens) }))
      .filter((scored) => scored.score > 0)
      .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title))
      .slice(0, limit)
      .map(({ document, score }) => toEvidence(document, score));
  }
}
