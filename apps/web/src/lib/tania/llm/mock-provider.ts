import type { Evidence, Intent } from '@/lib/tania/types';
import type { LlmProvider, LlmRequest, LlmResult, LlmStreamChunk } from './provider';

const OPENERS: Record<Intent, string> = {
  ANALYZE: 'Berikut analisis ringkas berdasarkan sumber internal DPS yang dapat Anda akses.',
  CREATE: 'Berikut draf awal yang saya susun mengacu pada template dan standar DPS.',
  SEARCH: 'Saya menemukan referensi berikut dari basis pengetahuan DPS.',
  AUTOMATE: 'Berikut rencana otomatisasi yang saya siapkan sebelum dieksekusi.',
  CONVERSE: 'Berikut jawaban saya berdasarkan konteks yang tersedia.',
};

const SUGGESTIONS: Record<Intent, string[]> = {
  ANALYZE: ['Bandingkan dengan kuartal sebelumnya', 'Buat ringkasan untuk leadership'],
  CREATE: ['Kembangkan menjadi dokumen lengkap', 'Sesuaikan gaya bahasa untuk pelanggan'],
  SEARCH: ['Tampilkan dokumen terkait lainnya', 'Ringkas dokumen teratas'],
  AUTOMATE: ['Tinjau langkah eksekusi', 'Jadwalkan untuk awal pekan depan'],
  CONVERSE: ['Perdalam topik ini', 'Kaitkan dengan prioritas DPS 2026'],
};

function citeEvidence(evidence: Evidence[]): string {
  if (evidence.length === 0) {
    return 'Saya belum menemukan dokumen internal yang relevan dan dapat Anda akses, jadi jawaban ini belum memiliki rujukan enterprise.';
  }
  return evidence
    .map(
      (item, index) =>
        `${index + 1}. ${item.title} — ${item.snippet} (${item.source}, diperbarui ${item.updatedAt})`,
    )
    .join('\n');
}

function compose({ intent, evidence, messages }: LlmRequest): string {
  const question = messages.findLast((message) => message.role === 'user')?.content ?? '';

  return [
    OPENERS[intent],
    '',
    `Pertanyaan: ${question}`,
    '',
    'Evidence:',
    citeEvidence(evidence),
    '',
    evidence.length > 0
      ? 'Kesimpulan: gunakan rujukan di atas sebagai dasar keputusan, dan minta TANIA menindaklanjuti bila perlu tindakan lanjutan.'
      : 'Kesimpulan: persempit pertanyaan atau unggah dokumen pendukung agar saya dapat menjawab dengan rujukan.',
  ].join('\n');
}

/**
 * Deterministic development adapter.
 *
 * It composes an answer strictly from retrieved evidence, so the portal can be
 * demonstrated end to end without any model credential. Streaming is real: the
 * text is emitted in chunks, which is what the UI renders progressively.
 */
export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock';
  readonly supportsStreaming = true;

  constructor(
    readonly model: string = 'tania-mock-v1',
    /** Delay between chunks; zero in tests keeps them instant. */
    private readonly chunkDelayMs = 18,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResult> {
    return {
      text: compose(request),
      model: this.model,
      suggestions: SUGGESTIONS[request.intent],
    };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const text = compose(request);
    // Word-sized chunks: close enough to a token stream to exercise the UI.
    const chunks = text.match(/\S+\s*/g) ?? [text];

    for (const [index, chunk] of chunks.entries()) {
      if (this.chunkDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.chunkDelayMs));
      }

      const last = index === chunks.length - 1;
      yield last
        ? {
            text: chunk,
            done: true,
            result: { text, model: this.model, suggestions: SUGGESTIONS[request.intent] },
          }
        : { text: chunk };
    }
  }
}

export { SUGGESTIONS as MOCK_SUGGESTIONS };
