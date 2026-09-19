import { describe, expect, it } from 'vitest';
import type { JarvisCommand, JarvisResult } from '@tania/types';
import { JARVIS_CAPABILITIES } from '@tania/types';
import { CapabilityRoutingAdapter } from '@/lib/tania/runtime/adapter';
import { createMockCapabilityAdapters } from '@/lib/tania/runtime/capabilities/mock';
import { HttpCapabilityAdapter } from '@/lib/tania/runtime/capabilities/http';
import { JarvisClient } from '@/lib/tania/runtime/client';
import { createCapabilityAdapters } from '@/lib/tania/runtime/jarvis';
import { config, loadConfig } from '@/lib/config/env';
import { buildCommand } from '@/lib/tania/runtime/commands';

function client(): JarvisClient {
  return new JarvisClient(
    new CapabilityRoutingAdapter({ adapters: createMockCapabilityAdapters(), sleep: async () => {} }),
    { correlationId: 'req-1', actorId: 'usr_henri' },
  );
}

describe('simulated capabilities', () => {
  it('transcribes the text it was given, and says it heard nothing', async () => {
    const result = await client().transcribe({ transcript: 'halo TANIA' });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.output?.transcript).toBe('halo TANIA');
    expect(result.output?.simulated).toBe(true);
  });

  it('refuses to transcribe nothing', async () => {
    const result = await client().transcribe({});

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('NO_AUDIO');
  });

  it('prepares speech as an artifact without playing audio', async () => {
    const result = await client().speak({ text: 'Laporan siap.' });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.kind).toBe('audio');
    expect(result.summary).toContain('tidak ada audio');
  });

  it('records an image reference without describing what it never saw', async () => {
    const result = await client().describeImage({ imageUri: 'https://example.test/a.png' });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.output?.described).toBe(false);
  });

  it('validates a browser URL before pretending to navigate', async () => {
    expect((await client().openPage({ url: 'ftp://example.test' })).error?.code).toBe('INVALID_URL');

    const ok = await client().openPage({ url: 'https://example.test' });
    expect(ok.status).toBe('SUCCEEDED');
    expect(ok.output?.loaded).toBe(false);
  });

  it('refuses computer control rather than simulating a success', async () => {
    const result = await client().controlComputer({ instruction: 'buka aplikasi' }, 'apr-1');

    // A simulated success here would teach callers that this is harmless.
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.error?.retryable).toBe(false);
  });

  it('reads back what it wrote, and admits when a file is absent', async () => {
    const jarvis = client();

    const written = await jarvis.writeFile({ path: 'notes.txt', content: 'isi' });
    expect(written.status).toBe('SUCCEEDED');
    expect(written.artifacts[0]?.name).toBe('notes.txt');

    const read = await jarvis.readFile({ path: 'notes.txt' });
    expect(read.artifacts[0]?.text).toBe('isi');

    const missing = await jarvis.readFile({ path: 'hilang.txt' });
    expect(missing.error?.code).toBe('NOT_FOUND');
  });

  it('lists skills and refuses one it does not have', async () => {
    const jarvis = client();

    const listed = await jarvis.listSkills();
    expect(listed.output?.skills).toEqual(['skill.echo', 'skill.summarize']);

    expect((await jarvis.runSkill({ skill: 'skill.echo' })).status).toBe('SUCCEEDED');
    expect((await jarvis.runSkill({ skill: 'skill.unknown' })).error?.code).toBe('SKILL_NOT_FOUND');
  });

  it('tracks runtime session state', async () => {
    const jarvis = client();

    expect((await jarvis.sessionStatus('conv-1')).output?.state).toBe('CLOSED');
    await jarvis.openSession('conv-1');
    expect((await jarvis.sessionStatus('conv-1')).output?.state).toBe('OPEN');
    await jarvis.closeSession('conv-1');
    expect((await jarvis.sessionStatus('conv-1')).output?.state).toBe('CLOSED');
  });

  it('verifies only the record it was handed, and says so', async () => {
    const jarvis = client();

    const ok = await jarvis.verify({ requestId: 'req-1', artifacts: [{}], expectedArtifacts: 1 });
    expect(ok.output?.ok).toBe(true);
    expect(ok.output?.scope).toBe('record-only');

    const short = await jarvis.verify({ requestId: 'req-1', artifacts: [], expectedArtifacts: 2 });
    expect(short.output?.ok).toBe(false);
    expect((short.output?.issues as string[])[0]).toContain('diharapkan 2');
  });

  it('rejects an action a capability does not model', async () => {
    const adapter = new CapabilityRoutingAdapter({ adapters: createMockCapabilityAdapters() });

    const result = await adapter.dispatch(
      buildCommand({
        capability: 'files',
        action: 'files.shred',
        task: 'Menghapus permanen',
        risk: 'CRITICAL',
      }),
    );

    expect(result.status).toBe('UNSUPPORTED');
  });
});

describe('http transport', () => {
  function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
    const calls: Array<{ url: string; body: JarvisCommand }> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as JarvisCommand;
      calls.push({ url: String(url), body });
      return handler(String(url), init ?? {});
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('posts the command envelope and returns what came back', async () => {
    const { impl, calls } = fakeFetch(() =>
      jsonResponse({
        status: 'SUCCEEDED',
        evidence: [],
        artifacts: [],
        executionTime: 12,
        summary: 'dijalankan',
      } satisfies JarvisResult),
    );

    const adapter = new HttpCapabilityAdapter({
      capability: 'tools',
      baseUrl: 'https://jarvis.test/',
      fetchImpl: impl,
    });

    const command = buildCommand({
      capability: 'tools',
      action: 'tools.invoke',
      task: 'Menjalankan tool',
      risk: 'LOW',
    });
    const result = await adapter.handle(command);

    expect(calls[0]?.url).toBe('https://jarvis.test/v1/commands');
    expect(calls[0]?.body.requestId).toBe(command.requestId);
    expect(calls[0]?.body.action).toBe('tools.invoke');
    expect(result.status).toBe('SUCCEEDED');
    expect(adapter.live).toBe(true);
  });

  it('treats a transport failure as retryable and a bad request as not', async () => {
    const unreachable = new HttpCapabilityAdapter({
      capability: 'tools',
      baseUrl: 'https://jarvis.test',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });

    const down = await unreachable.handle(
      buildCommand({ capability: 'tools', action: 'tools.invoke', task: 't', risk: 'LOW' }),
    );
    expect(down.error?.code).toBe('RUNTIME_UNREACHABLE');
    expect(down.error?.retryable).toBe(true);

    const { impl } = fakeFetch(() => jsonResponse({ message: 'nope' }, 400));
    const rejected = new HttpCapabilityAdapter({
      capability: 'tools',
      baseUrl: 'https://jarvis.test',
      fetchImpl: impl,
    });

    const bad = await rejected.handle(
      buildCommand({ capability: 'tools', action: 'tools.invoke', task: 't', risk: 'LOW' }),
    );
    expect(bad.error?.code).toBe('RUNTIME_400');
    expect(bad.error?.retryable).toBe(false);
  });

  it('refuses a response that is not a JarvisResult instead of passing it through', async () => {
    const { impl } = fakeFetch(() => jsonResponse({ nonsense: true }));
    const adapter = new HttpCapabilityAdapter({
      capability: 'tools',
      baseUrl: 'https://jarvis.test',
      fetchImpl: impl,
    });

    const result = await adapter.handle(
      buildCommand({ capability: 'tools', action: 'tools.invoke', task: 't', risk: 'LOW' }),
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('RUNTIME_BAD_RESPONSE');
  });

  it('unwraps the shared API envelope when the runtime uses one', async () => {
    const { impl } = fakeFetch(() =>
      jsonResponse({
        data: { status: 'SUCCEEDED', evidence: [], artifacts: [], executionTime: 5 },
        requestId: 'x',
      }),
    );
    const adapter = new HttpCapabilityAdapter({
      capability: 'files',
      baseUrl: 'https://jarvis.test',
      fetchImpl: impl,
    });

    const result = await adapter.handle(
      buildCommand({ capability: 'files', action: 'files.list', task: 't', risk: 'LOW' }),
    );

    expect(result.status).toBe('SUCCEEDED');
  });
});

describe('declaring what the runtime actually serves', () => {
  it('routes only the declared capabilities to JARVIS', () => {
    const adapters = createCapabilityAdapters({
      ...config,
      runtime: { adapter: 'jarvis', baseUrl: 'https://jarvis.test', capabilities: ['tools', 'files'] },
    });

    const live = adapters.filter((adapter) => adapter.live).map((adapter) => adapter.capability);
    expect(live.sort()).toEqual(['files', 'tools']);

    // Everything else stays simulated rather than being reported as live.
    expect(adapters).toHaveLength(JARVIS_CAPABILITIES.length);
  });

  it('serves the whole contract when no narrowing is declared', () => {
    const adapters = createCapabilityAdapters({
      ...config,
      runtime: { adapter: 'jarvis', baseUrl: 'https://jarvis.test' },
    });

    expect(adapters.every((adapter) => adapter.live)).toBe(true);
  });

  it('stays simulated when no runtime is configured', () => {
    const adapters = createCapabilityAdapters({ ...config, runtime: { adapter: 'mock' } });

    expect(adapters.some((adapter) => adapter.live)).toBe(false);
  });

  it('refuses a capability name that does not exist', () => {
    expect(() => loadConfig({ JARVIS_CAPABILITIES: 'tools,telepathy' })).toThrow(
      /unknown capabilities: telepathy/,
    );
    expect(loadConfig({ JARVIS_CAPABILITIES: 'tools, files' }).runtime.capabilities).toEqual([
      'tools',
      'files',
    ]);
  });
});
