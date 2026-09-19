import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JARVIS_CAPABILITIES, type JarvisCommand, type JarvisResult } from '@tania/types';

const TOKEN = 'runtime-contract-test-token';
process.env.TANIA_RUNTIME_TOKEN = TOKEN;

const { AppModule } = await import('../src/app.module.js');

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

function command(overrides: Partial<JarvisCommand> = {}): JarvisCommand {
  return {
    requestId: `req-${Math.random().toString(36).slice(2)}`,
    capability: 'tools',
    action: 'tools.invoke',
    task: 'Menjalankan Knowledge Search',
    parameters: { toolId: 'knowledge.search' },
    risk: 'INFORMATIONAL',
    requiresApproval: false,
    ...overrides,
  };
}

function send(body: unknown, token = TOKEN) {
  return request(app.getHttpServer())
    .post('/v1/commands')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
}

describe('authentication', () => {
  it('refuses a request with no token', async () => {
    await request(app.getHttpServer()).post('/v1/commands').send(command()).expect(401);
  });

  it('refuses a wrong token', async () => {
    await send(command(), 'not-the-token').expect(401);
  });

  it('admits the configured token', async () => {
    await send(command()).expect(201);
  });

  it('leaves health open, so an orchestrator can poll it', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.state).toBe('ok');
  });
});

describe('the result contract', () => {
  it('returns every field the contract names', async () => {
    const response = await send(command()).expect(201);
    const result = response.body as JarvisResult;

    expect(result.status).toBe('SUCCEEDED');
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(typeof result.executionTime).toBe('number');
    expect(result.executionTime).toBeGreaterThan(0);
  });

  it('echoes the requestId so a result is traceable on its own', async () => {
    const sent = command();
    const response = await send(sent).expect(201);

    expect((response.body as JarvisResult).requestId).toBe(sent.requestId);
  });
});

describe('the approval gate at the runtime edge', () => {
  it('rejects a command that claims approval but carries none', async () => {
    // The last place this can be caught. TANIA checks it too; a gate enforced
    // on only one side is one a direct caller walks straight through.
    const response = await send(
      command({ risk: 'HIGH', requiresApproval: true, parameters: { toolId: 'workflow.execute' } }),
    ).expect(201);
    const result = response.body as JarvisResult;

    expect(result.status).toBe('REJECTED');
    expect(result.error?.code).toBe('APPROVAL_REQUIRED');
    expect(result.error?.retryable).toBe(false);
  });

  it('runs the same command once the decision is attached', async () => {
    const response = await send(
      command({
        risk: 'HIGH',
        requiresApproval: true,
        approvalId: 'apr-1',
        parameters: { toolId: 'workflow.execute' },
      }),
    ).expect(201);

    expect((response.body as JarvisResult).status).toBe('SUCCEEDED');
  });
});

describe('tools', () => {
  it('refuses a tool the manifest does not publish', async () => {
    const response = await send(command({ parameters: { toolId: 'rm.minus.rf' } })).expect(201);
    const result = response.body as JarvisResult;

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('TOOL_UNKNOWN');
  });

  it('declines to undo a tool that declares itself irreversible', async () => {
    const response = await send(
      command({ action: 'tools.compensate', parameters: { toolId: 'knowledge.search' } }),
    ).expect(201);

    expect((response.body as JarvisResult).error?.code).toBe('TOOL_NOT_REVERSIBLE');
  });

  it('compensates a reversible tool', async () => {
    const response = await send(
      command({ action: 'tools.compensate', parameters: { toolId: 'document.draft' } }),
    ).expect(201);

    expect((response.body as JarvisResult).status).toBe('SUCCEEDED');
  });
});

describe('capabilities this runtime cannot serve', () => {
  it.each(['voice.input', 'voice.output', 'vision', 'browser', 'computer'])(
    'answers UNSUPPORTED for %s rather than simulating it',
    async (capability) => {
      const response = await send(
        command({ capability: capability as JarvisCommand['capability'], action: `${capability}.do` }),
      ).expect(201);
      const result = response.body as JarvisResult;

      expect(result.status).toBe('UNSUPPORTED');
      expect(result.error?.message.length).toBeGreaterThan(0);
    },
  );

  it('answers UNSUPPORTED for a capability outside the contract', async () => {
    const response = await send(
      command({ capability: 'telepathy' as JarvisCommand['capability'] }),
    ).expect(201);

    expect((response.body as JarvisResult).error?.code).toBe('CAPABILITY_UNKNOWN');
  });

  it('refuses an action a served capability does not model', async () => {
    const response = await send(command({ action: 'tools.detonate' })).expect(201);

    expect((response.body as JarvisResult).error?.code).toBe('ACTION_UNKNOWN');
  });
});

describe('files', () => {
  it('writes and reads back within the workspace', async () => {
    await send(
      command({ capability: 'files', action: 'files.write', parameters: { path: 'note.md', content: 'halo' } }),
    ).expect(201);

    const response = await send(
      command({ capability: 'files', action: 'files.read', parameters: { path: 'note.md' } }),
    ).expect(201);

    expect((response.body as JarvisResult).output?.content).toBe('halo');
  });

  it('says a missing file is missing', async () => {
    const response = await send(
      command({ capability: 'files', action: 'files.read', parameters: { path: 'absent.md' } }),
    ).expect(201);

    expect((response.body as JarvisResult).error?.code).toBe('FILE_NOT_FOUND');
  });

  it.each(['../escape.md', '/etc/passwd', 'a\\b.md'])('refuses the path %s', async (path) => {
    const response = await send(
      command({ capability: 'files', action: 'files.read', parameters: { path } }),
    ).expect(201);

    expect((response.body as JarvisResult).error?.code).toBe('PATH_REFUSED');
  });
});

describe('verification', () => {
  it('will not report success over nothing', async () => {
    // A comfortable `ok: true` here would travel into a task's verification
    // record and make an unverified run look checked.
    const response = await send(
      command({ capability: 'verification', action: 'verification.check', parameters: {} }),
    ).expect(201);

    expect((response.body as JarvisResult).output?.ok).toBe(false);
  });

  it('checks the claims it was handed', async () => {
    const response = await send(
      command({
        capability: 'verification',
        action: 'verification.check',
        parameters: { claims: ['a', 'b'] },
      }),
    ).expect(201);

    expect((response.body as JarvisResult).output).toMatchObject({ ok: true, checked: 2 });
  });
});

describe('the manifest', () => {
  it('declares effect, reversibility and risk for every tool', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/manifest')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.body.tools.length).toBeGreaterThan(0);
    for (const tool of response.body.tools) {
      expect(tool.effect.length, tool.toolId).toBeGreaterThan(0);
      expect(typeof tool.reversible, tool.toolId).toBe('boolean');
      expect(tool.defaultRisk, tool.toolId).toBeTruthy();
      expect(Array.isArray(tool.requiredScopes), tool.toolId).toBe(true);
    }
  });

  it('accounts for all ten capabilities, supported or not', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/manifest')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    const named = response.body.capabilities.map((c: { capability: string }) => c.capability).sort();
    expect(named).toEqual([...JARVIS_CAPABILITIES].sort());
  });
});
