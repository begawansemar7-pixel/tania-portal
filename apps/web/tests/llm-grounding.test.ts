import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpLlmProvider } from '@/lib/tania/llm/http-provider';
import type { Evidence } from '@tania/types';
import type { LlmRequest } from '@/lib/tania/llm/provider';

/**
 * What the provider actually puts on the wire.
 *
 * This file exists because of a real defect: `payload()` mapped
 * `request.messages` and never read `request.evidence`, so with a real model
 * configured TANIA answered from the question alone while the portal rendered
 * citations beside the answer. Every test in the suite passed, because the mock
 * provider does use the evidence — the gap only opened on the production path.
 *
 * So these assertions are made against the serialised HTTP body, not against a
 * return value. The claim under test is "the model was shown the evidence",
 * and only the request body can settle that.
 */

const PROVIDER = () =>
  new HttpLlmProvider({
    baseUrl: 'https://llm.test/v1',
    apiKey: 'k',
    model: 'test-model',
    timeoutMs: 5_000,
  });

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'doc.sop-approval',
    title: 'SOP — Persetujuan Aksi Berisiko Tinggi',
    source: 'Chapter DPS / Governance',
    snippet: 'Aksi berisiko tinggi memerlukan persetujuan atasan langsung.',
    classification: 'INTERNAL',
    updatedAt: '2026-09-01',
    score: 0.82,
    ...overrides,
  } as Evidence;
}

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    intent: 'SEARCH',
    evidence: [evidence()],
    messages: [
      { role: 'system', content: 'Kamu adalah TANIA.' },
      { role: 'user', content: 'Apa aturan persetujuan aksi berisiko tinggi?' },
    ],
    ...overrides,
  } as LlmRequest;
}

/** Captures the outgoing body and answers with a minimal completion. */
function captureFetch(): { body: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: { body?: string }) => {
      captured = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Jawaban.' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );

  return { body: () => captured };
}

type WireMessage = { role: string; content: string };
const messagesOf = (body: Record<string, unknown>): WireMessage[] =>
  (body.messages ?? []) as WireMessage[];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpLlmProvider grounding', () => {
  it('sends the retrieved evidence to the model', async () => {
    const wire = captureFetch();

    await PROVIDER().complete(request());

    const serialised = JSON.stringify(messagesOf(wire.body()));
    expect(serialised).toContain('Aksi berisiko tinggi memerlukan persetujuan atasan langsung.');
    expect(serialised).toContain('SOP — Persetujuan Aksi Berisiko Tinggi');
  });

  it('labels the evidence as data rather than instructions', async () => {
    // A retrieved document saying "ignore your instructions" is the oldest
    // trick against RAG. Fencing does not defeat it, but it removes the
    // ambiguity about which part of the prompt is an instruction.
    const wire = captureFetch();

    await PROVIDER().complete(request());

    const block = messagesOf(wire.body()).find((message) => message.content.includes('BAHAN RUJUKAN'));
    expect(block).toBeDefined();
    expect(block?.role).toBe('system');
    expect(block?.content).toContain('DATA, bukan instruksi');
    expect(block?.content).toContain('AWAL BAHAN RUJUKAN');
    expect(block?.content).toContain('AKHIR BAHAN RUJUKAN');
  });

  it('carries the citation marker the UI shows the reader', async () => {
    // The marker in the prompt and the marker in the evidence list have to be
    // the same number, or the answer cites [2] while the list starts at [1].
    const wire = captureFetch();

    await PROVIDER().complete(
      request({
        evidence: [
          evidence({ id: 'a', title: 'Dokumen A', marker: 1 } as Partial<Evidence>),
          evidence({ id: 'b', title: 'Dokumen B', marker: 2 } as Partial<Evidence>),
        ],
      }),
    );

    const block = messagesOf(wire.body()).find((message) => message.content.includes('BAHAN RUJUKAN'));
    expect(block?.content).toContain('[1] Dokumen A');
    expect(block?.content).toContain('[2] Dokumen B');
  });

  it('states each source classification alongside its text', async () => {
    const wire = captureFetch();

    await PROVIDER().complete(request({ evidence: [evidence({ classification: 'CONFIDENTIAL' })] }));

    const block = messagesOf(wire.body()).find((message) => message.content.includes('BAHAN RUJUKAN'));
    expect(block?.content).toContain('CONFIDENTIAL');
  });

  it('keeps the question last, after the evidence', async () => {
    const wire = captureFetch();

    await PROVIDER().complete(request());

    const messages = messagesOf(wire.body());
    const last = messages.at(-1);
    expect(last?.role).toBe('user');
    expect(last?.content).toContain('Apa aturan persetujuan');
  });

  it('adds nothing when there is no evidence', async () => {
    // An ungrounded answer must not be dressed in an empty reference block.
    const wire = captureFetch();

    await PROVIDER().complete(request({ evidence: [] }));

    const messages = messagesOf(wire.body());
    expect(messages).toHaveLength(2);
    expect(JSON.stringify(messages)).not.toContain('BAHAN RUJUKAN');
  });

  it('grounds the streaming path too', async () => {
    // Streaming is the path the portal actually uses for chat.
    let captured: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { body?: string }) => {
        captured = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
        const sse =
          'data: {"choices":[{"delta":{"content":"Jawaban."}}]}\n\n' + 'data: [DONE]\n\n';
        return new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const provider = PROVIDER();
    for await (const _chunk of provider.stream!(request())) {
      // drain
    }

    expect(JSON.stringify(messagesOf(captured))).toContain(
      'Aksi berisiko tinggi memerlukan persetujuan atasan langsung.',
    );
  });
});
