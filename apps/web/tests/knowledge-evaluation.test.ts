import { beforeAll, describe, expect, it } from 'vitest';
import { createKnowledgeStack, NO_SOURCE_ANSWER } from '@/lib/knowledge';
import { MockLlmProvider } from '@/lib/tania/llm/mock-provider';
import { ENTERPRISE_DOCUMENTS } from '@/lib/knowledge/corpus/enterprise-documents';
import {
  CHAPTER_LEAD,
  CLEARED_OUTSIDER,
  CONTRACTOR,
  IRRELEVANT_QUESTIONS,
  PERMISSION_CASES,
  RELEVANT_CASES,
  STAFF,
  UNSUPPORTED_FACT_QUESTIONS,
} from '@/lib/knowledge/evaluation/fixtures';
import { loadConfig } from '@/lib/config/env';
import type { RagService } from '@/lib/knowledge/rag-service';

const cfg = loadConfig({ TANIA_RAG_TOP_K: '4' });

let rag: RagService;

beforeAll(async () => {
  const stack = createKnowledgeStack({ llm: new MockLlmProvider('tania-mock-v1', 0), cfg });
  await stack.ensureIndexed();
  rag = stack.rag;
}, 30_000);

function citedDocuments(citations: Array<{ documentId: string }>): string[] {
  return [...new Set(citations.map((citation) => citation.documentId))];
}

describe('evaluation: relevant retrieval', () => {
  it.each(RELEVANT_CASES.map((testCase) => [testCase.id, testCase] as const))(
    '%s finds the expected document',
    async (_id, testCase) => {
      const result = await rag.retrieve({ query: testCase.question, limit: 4 }, CHAPTER_LEAD);
      const documents = citedDocuments(result.citations);

      expect(result.grounded, testCase.note).toBe(true);
      for (const expected of testCase.expectedDocuments) {
        expect(documents, testCase.note).toContain(expected);
      }
      expect(result.confidence.level).not.toBe('NONE');
    },
  );

  it('ranks the expected document first for a precise procedural question', async () => {
    const result = await rag.retrieve(
      { query: 'Siapa yang berwenang menyetujui aksi berisiko tinggi?', limit: 4 },
      CHAPTER_LEAD,
    );

    expect(result.citations[0]?.documentId).toBe('doc.sop-approval');
    expect(result.citations[0]?.locator).toContain('Kewenangan');
  });
});

describe('evaluation: irrelevant retrieval', () => {
  it.each(IRRELEVANT_QUESTIONS)('declines to ground "%s"', async (question) => {
    const result = await rag.retrieve({ query: question, limit: 4 }, CHAPTER_LEAD);

    expect(result.grounded).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.confidence.level).toBe('NONE');
  });

  it('answers an unrelated question by saying it has no source', async () => {
    const response = await rag.answer(
      { query: 'Bagaimana resep rendang padang yang autentik?', limit: 4 },
      CHAPTER_LEAD,
    );

    expect(response.answer).toBe(NO_SOURCE_ANSWER);
    expect(response.citations).toHaveLength(0);
    expect(response.confidence.score).toBeLessThan(0.3);
  });
});

describe('evaluation: permission filtering', () => {
  it.each(PERMISSION_CASES.map((testCase) => [testCase.id, testCase] as const))(
    '%s never returns forbidden material',
    async (_id, testCase) => {
      const result = await rag.retrieve({ query: testCase.question, limit: 6 }, testCase.actor);

      const cited = citedDocuments(result.citations);
      const considered = result.retrievedDocuments.map((document) => document.documentId);

      for (const forbidden of testCase.forbiddenDocuments) {
        expect(cited, testCase.note).not.toContain(forbidden);
        // Not even as a "considered" document: filtering happens before scoring.
        expect(considered, testCase.note).not.toContain(forbidden);
      }
    },
  );

  it('gives the same question different answers depending on clearance', async () => {
    const question = 'Berapa program yang berstatus at risk pada kuartal ini?';

    const lead = await rag.retrieve({ query: question, limit: 4 }, CHAPTER_LEAD);
    const staff = await rag.retrieve({ query: question, limit: 4 }, STAFF);

    expect(citedDocuments(lead.citations)).toContain('doc.report-delivery-q3');
    expect(citedDocuments(staff.citations)).not.toContain('doc.report-delivery-q3');
  });

  it('never leaks a restricted document to a cleared actor from the wrong unit', async () => {
    const result = await rag.retrieve(
      { query: 'band kompensasi chapter', limit: 6 },
      CLEARED_OUTSIDER,
    );

    expect(citedDocuments(result.citations)).not.toContain('doc.report-compensation-band');
  });

  it('returns nothing at all to an actor with only public clearance on internal topics', async () => {
    const result = await rag.retrieve(
      { query: 'jejak audit persetujuan aksi berisiko tinggi', limit: 6 },
      CONTRACTOR,
    );

    const documents = result.retrievedDocuments.map((document) => document.documentId);
    expect(documents).not.toContain('doc.sop-approval');
    expect(documents.every((id) => id !== 'doc.architecture-tania')).toBe(true);
  });
});

describe('evaluation: citation correctness', () => {
  it('cites only passages that were retrieved', async () => {
    const result = await rag.retrieve(
      { query: 'Apa ruang lingkup rilis Portal TANIA v1?', limit: 4 },
      CHAPTER_LEAD,
    );

    const verification = new (await import('@/lib/knowledge/citations/citation-service')).MarkerCitationService().verify(
      result.citations.map((citation) => citation.id),
      result.chunks,
    );

    expect(verification.ok).toBe(true);
    expect(verification.unsupported).toEqual([]);
  });

  it('gives every citation a resolvable locator and a document it belongs to', async () => {
    const result = await rag.retrieve(
      { query: 'SLA ketersediaan paket Dedicated', limit: 4 },
      CHAPTER_LEAD,
    );

    for (const citation of result.citations) {
      expect(citation.documentId).toMatch(/^doc\./);
      expect(citation.locator.length).toBeGreaterThan(0);
      expect(citation.marker).toBeGreaterThan(0);
      expect(citation.snippet.length).toBeGreaterThan(0);

      const document = ENTERPRISE_DOCUMENTS.find((entry) => entry.id === citation.documentId);
      expect(document, 'citation points at a real document').toBeDefined();
      expect(citation.classification).toBe(document?.acl.classification);
    }
  });

  it('numbers markers consecutively from one', async () => {
    const result = await rag.retrieve(
      { query: 'prosedur persetujuan dan jejak audit', limit: 4 },
      CHAPTER_LEAD,
    );

    expect(result.citations.map((citation) => citation.marker)).toEqual(
      result.citations.map((_citation, index) => index + 1),
    );
  });

  it('reports every considered document, marking which ones were cited', async () => {
    const result = await rag.retrieve(
      { query: 'status program at risk kuartal ini', limit: 4 },
      CHAPTER_LEAD,
    );

    expect(result.retrievedDocuments.length).toBeGreaterThan(0);
    expect(result.retrievedDocuments.some((document) => document.cited)).toBe(true);
    for (const document of result.retrievedDocuments) {
      expect(document.passages).toBeGreaterThan(0);
      expect(document.score).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('evaluation: known limits of lexical retrieval', () => {
  /**
   * Pinned on purpose. With hashed embeddings the pipeline matches *words*, not
   * meaning, so a question about salary bands reaches a runtime SOP that uses
   * the same Indonesian word ("kompensasi") in a different sense.
   *
   * The guarantees that matter still hold: the restricted salary document stays
   * invisible, confidence is not HIGH, and the citation shown makes the mismatch
   * obvious to a reader. Swapping in real embeddings should make this test fail
   * — that is the signal to tighten it.
   */
  it('grounds a lexically-similar but semantically-unrelated question only weakly', async () => {
    const result = await rag.retrieve(
      { query: 'band kompensasi chapter dan rentang nilainya', limit: 5 },
      CHAPTER_LEAD,
    );

    expect(citedDocuments(result.citations)).not.toContain('doc.report-compensation-band');
    expect(result.confidence.level).not.toBe('HIGH');
    expect(result.citations[0]?.locator).toBeTruthy();
  });

  it('keeps a corpus-wide word from grounding an answer on its own', async () => {
    const result = await rag.retrieve({ query: 'chapter', limit: 5 }, CHAPTER_LEAD);

    // "chapter" appears across the corpus, so it carries almost no information.
    expect(result.confidence.level === 'NONE' || result.confidence.score < 0.6).toBe(true);
  });
});

describe('evaluation: hallucination resistance', () => {
  it.each(UNSUPPORTED_FACT_QUESTIONS)('refuses to invent an answer for "%s"', async (question) => {
    const response = await rag.answer({ query: question, limit: 4 }, CHAPTER_LEAD);

    if (response.citations.length === 0) {
      expect(response.answer).toBe(NO_SOURCE_ANSWER);
      return;
    }

    // If it did ground, every cited passage must be real and the answer must
    // not present a figure that appears in no citation.
    const corpusText = response.citations.map((citation) => citation.snippet).join(' ');
    const numbers = response.answer.match(/\b\d[\d.,]{2,}\b/g) ?? [];
    for (const number of numbers) {
      expect(corpusText.includes(number), `angka ${number} harus berasal dari kutipan`).toBe(true);
    }
  });

  it('never returns citations when it is not grounded', async () => {
    const response = await rag.answer(
      { query: 'Siapa pemenang liga sepak bola musim lalu?', limit: 4 },
      CHAPTER_LEAD,
    );

    expect(response.confidence.level).toBe('NONE');
    expect(response.citations).toEqual([]);
    expect(response.retrievedDocuments.every((document) => !document.cited)).toBe(true);
  });
});
