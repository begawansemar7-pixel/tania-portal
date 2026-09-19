import { describe, expect, it } from 'vitest';
import {
  IntentService,
  KeywordIntentClassifier,
  LlmIntentClassifier,
} from '@/lib/tania/services/intent-service';
import type { LlmProvider, LlmResult } from '@/lib/tania/llm';

function fakeLlm(text: string, fail = false): LlmProvider {
  return {
    id: 'fake',
    model: 'fake-1',
    supportsStreaming: false,
    async complete(): Promise<LlmResult> {
      if (fail) throw new Error('model unavailable');
      return { text, model: 'fake-1', suggestions: [] };
    },
  };
}

describe('KeywordIntentClassifier', () => {
  const classifier = new KeywordIntentClassifier();

  it('classifies with a confidence and a user-safe signal', () => {
    const result = classifier.classify('Jalankan workflow laporan status mingguan');

    expect(result.intent).toBe('AUTOMATE');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.signal).toMatch(/^cocok:/);
  });

  it('falls back to CONVERSE with low confidence when nothing matches', () => {
    const result = classifier.classify('Halo, apa kabar hari ini');

    expect(result.intent).toBe('CONVERSE');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('IntentService', () => {
  const service = new IntentService(new KeywordIntentClassifier());

  it('lets an explicit user choice win over inference', async () => {
    const intent = await service.classify('Cari kebijakan tata kelola AI', 'CREATE');

    expect(intent.value).toBe('CREATE');
    expect(intent.confidence).toBe(1);
    expect(intent.signal).toBe('dipilih pengguna');
  });

  it('infers when no choice was made', async () => {
    const intent = await service.classify('Analisis kinerja portofolio kuartal ini');
    expect(intent.value).toBe('ANALYZE');
  });

  it('reports which classifier is in use', () => {
    expect(service.id).toBe('keyword');
  });
});

describe('LlmIntentClassifier', () => {
  it('uses the model label when it is recognised', async () => {
    const service = new IntentService(new LlmIntentClassifier(fakeLlm('AUTOMATE')));
    const intent = await service.classify('kirim rekap ke tim');

    expect(intent.value).toBe('AUTOMATE');
    expect(intent.signal).toBe('diklasifikasikan oleh model');
  });

  it('falls back to keywords when the model answers with nonsense', async () => {
    const service = new IntentService(new LlmIntentClassifier(fakeLlm('maybe?')));
    const intent = await service.classify('Buatkan draf proposal solusi');

    expect(intent.value).toBe('CREATE');
  });

  it('falls back to keywords when the model is unavailable', async () => {
    const service = new IntentService(new LlmIntentClassifier(fakeLlm('', true)));
    const intent = await service.classify('Cari kebijakan tata kelola AI');

    expect(intent.value).toBe('SEARCH');
  });
});
