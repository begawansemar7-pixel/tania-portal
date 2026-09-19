import { describe, expect, it } from 'vitest';
import { EnvValidationError } from '@tania/config';
import { describeConfig, loadConfig } from '@/lib/config/env';

describe('portal configuration', () => {
  it('runs on safe defaults with an empty environment', () => {
    const config = loadConfig({});

    expect(config.service).toBe('tania.web');
    expect(config.llm.provider).toBe('mock');
    expect(config.rag.retriever).toBe('mock');
    expect(config.rag.topK).toBe(3);
    expect(config.runtime.adapter).toBe('mock');
    expect(config.governance.approvalThreshold).toBe('HIGH');
    expect(config.governance.auditEnabled).toBe(true);
    expect(config.api.baseUrl).toBeUndefined();
  });

  it('reads backend wiring from the environment', () => {
    const config = loadConfig({
      TANIA_API_BASE_URL: 'http://localhost:4000',
      TANIA_SERVICE_TOKEN: 'token',
      TANIA_API_TIMEOUT_MS: '2500',
    });

    expect(config.api.baseUrl).toBe('http://localhost:4000');
    expect(config.api.timeoutMs).toBe(2500);
  });

  it('rejects an invalid value instead of silently falling back', () => {
    expect(() => loadConfig({ TANIA_RAG_TOP_K: '0' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadConfig({ TANIA_LLM_PROVIDER: 'gemini' })).toThrow(
      /must be one of/,
    );
  });

  it('redacts secrets when describing configuration', () => {
    const described = describeConfig({ TANIA_SERVICE_TOKEN: 'super-secret' });

    expect(described.TANIA_SERVICE_TOKEN).toBe('«redacted»');
    expect(JSON.stringify(described)).not.toContain('super-secret');
  });
});
