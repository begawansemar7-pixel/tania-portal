import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { correlationMiddleware } from '../src/common/correlation.middleware.js';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter.js';
import { StructuredLogger } from '../src/common/logger.service.js';

const run = promisify(execFile);

/** npm workspaces hoist binaries to the repo root, so look in both places. */
function prismaBinary(): string {
  const candidates = ['node_modules/.bin/prisma', '../../node_modules/.bin/prisma'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Prisma CLI not found. Looked in: ${candidates.join(', ')}`);
  }
  return found;
}

const PORT = 54_330;
const SERVICE_TOKEN = 'e2e-service-token';
const DB_NAME = 'tania_e2e';

/**
 * Where the test database comes from.
 *
 * Locally: `embedded-postgres`, so a developer needs no Docker and no running
 * service. In CI that is not an option — the bundled `initdb` is linked against
 * `libicuuc.so.60`, which Ubuntu 24.04 runners do not ship, so it exits 127
 * before the first test runs. A service container supplies one instead and sets
 * `E2E_DATABASE_URL`.
 *
 * The suite itself is identical either way; only who starts the server differs.
 */
const EXTERNAL_DATABASE_URL = process.env.E2E_DATABASE_URL;

// Set before the app module loads: `ConfigModule.forRoot()` reads `.env` at
// import time, so a developer's local `.env` would otherwise win over these.
process.env.DATABASE_URL =
  EXTERNAL_DATABASE_URL ?? `postgresql://tania:tania@localhost:${PORT}/${DB_NAME}`;
process.env.AUTH_MODE = 'service';
process.env.TANIA_SERVICE_TOKEN = SERVICE_TOKEN;
process.env.NODE_ENV = 'test';

const { AppModule } = await import('../src/app.module.js');

function actorHeader(actor: {
  subject: string;
  name: string;
  email: string;
  scopes: string[];
  clearance?: string;
}): string {
  return Buffer.from(JSON.stringify(actor), 'utf8').toString('base64url');
}

const henri = actorHeader({
  subject: 'usr_henri',
  name: 'Henri',
  email: 'henri@dps.telkom.example',
  clearance: 'CONFIDENTIAL',
  scopes: ['knowledge:read', 'workflow:run', 'workflow:approve'],
});

const staff = actorHeader({
  subject: 'usr_staff',
  name: 'Staff',
  email: 'staff@dps.telkom.example',
  scopes: ['knowledge:read', 'workflow:run'],
});

let postgres: EmbeddedPostgres;
let app: INestApplication;
let databaseDir: string;

/** Returns the supertest request synchronously; awaiting it would fire it early. */
function authed(method: 'get' | 'post' | 'delete', path: string, actor = henri) {
  return request(app.getHttpServer())
    [method](path)
    .set('Authorization', `Bearer ${SERVICE_TOKEN}`)
    .set('x-tania-actor', actor);
}

beforeAll(async () => {
  if (!EXTERNAL_DATABASE_URL) {
    databaseDir = await mkdtemp(join(tmpdir(), 'tania-e2e-pg-'));

    postgres = new EmbeddedPostgres({
      databaseDir,
      user: 'tania',
      password: 'tania',
      port: PORT,
      persistent: false,
    });

    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase(DB_NAME);
  }

  await run(prismaBinary(), ['migrate', 'deploy'], {
    env: { ...process.env },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(correlationMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter(app.get(StructuredLogger)));
  await app.init();
}, 300_000);

afterAll(async () => {
  await app?.close();
  await postgres?.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
}, 120_000);

describe('Portal TANIA persistence', () => {
  let sessionId: string;
  let approvalId: string;

  it('exposes health without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.data.state).toBe('ok');
    expect(response.body.data.service).toBe('tania.api');
    expect(response.body.data.dependencies).toContainEqual(
      expect.objectContaining({ name: 'database', state: 'ok' }),
    );
    expect(response.body.meta.authMode).toBe('service');
    expect(response.body.requestId).toBeTruthy();
  });

  it('echoes a correlation id back on every response', async () => {
    const supplied = '3f6d0b1e-6f1a-4a7e-9f1b-2c9a0d1e4b77';
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', supplied)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(supplied);
    expect(response.body.requestId).toBe(supplied);
  });

  it('starts a fresh correlation id when the inbound one is not a uuid', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'not-a-uuid')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('not-a-uuid');
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the shared failure envelope with a correlation id', async () => {
    const response = await request(app.getHttpServer()).get('/v1/sessions').expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBeTruthy();
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects an unauthenticated API call', async () => {
    await request(app.getHttpServer()).get('/v1/sessions').expect(401);
  });

  it('rejects a call with a wrong service token', async () => {
    await request(app.getHttpServer())
      .get('/v1/sessions')
      .set('Authorization', 'Bearer wrong-token')
      .set('x-tania-actor', henri)
      .expect(401);
  });

  it('creates a session for the asserted actor', async () => {
    const response = await (authed('post', '/v1/sessions')).send({ channel: 'portal' }).expect(201);
    sessionId = response.body.data.id;
    expect(sessionId).toBeTruthy();
  });

  it('is idempotent when the portal replays the same session id', async () => {
    const replay = await authed('post', '/v1/sessions').send({ id: sessionId }).expect(201);
    expect(replay.body.data.id).toBe(sessionId);

    const sessions = await authed('get', '/v1/sessions').expect(200);
    expect(sessions.body.data.filter((s: { id: string }) => s.id === sessionId)).toHaveLength(1);
  });

  it('persists a full turn with evidence and trace', async () => {
    await (authed('post', `/v1/sessions/${sessionId}/turns`))
      .send({
        question: 'Jalankan workflow laporan status mingguan proyek',
        answer: 'Berikut rencana otomatisasi yang saya siapkan sebelum dieksekusi.',
        intent: 'AUTOMATE',
        risk: 'HIGH',
        model: 'tania-mock-v1',
        evidence: [{ id: 'doc.delivery-health', title: 'Delivery Health Report' }],
        trace: [{ id: 't1', label: 'Memahami permintaan', status: 'SUCCEEDED', stage: 'UNDERSTAND' }],
        tools: [
          { toolId: 'knowledge.search', name: 'Knowledge Search', status: 'SUCCEEDED', risk: 'INFORMATIONAL' },
        ],
      })
      .expect(201);

    const session = await (authed('get', `/v1/sessions/${sessionId}`)).expect(200);
    expect(session.body.data.messages).toHaveLength(2);
    expect(session.body.data.messages[1].role).toBe('TANIA');
    expect(session.body.data.messages[1].risk).toBe('HIGH');
    expect(session.body.data.title).toContain('Jalankan workflow');
  });

  it('rejects an invalid payload at the boundary', async () => {
    await (authed('post', `/v1/sessions/${sessionId}/turns`))
      .send({ question: 'tanpa jawaban' })
      .expect(400);
  });

  it('refuses access to another actor session', async () => {
    await (authed('get', `/v1/sessions/${sessionId}`, staff)).expect(403);
  });

  it('raises a pending approval for a high risk action', async () => {
    const response = await (authed('post', '/v1/approvals'))
      .send({
        sessionId,
        toolId: 'workflow.execute',
        action: 'Workflow Execution',
        risk: 'HIGH',
        reason: 'HIGH risk action requires human approval before execution.',
        effect: 'Triggers a multi-step automation that changes enterprise state.',
      })
      .expect(201);

    approvalId = response.body.data.id;
    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.executionStatus).toBe('NOT_EXECUTED');
  });

  it('refuses a decision from an actor without the approve scope', async () => {
    await (authed('post', `/v1/approvals/${approvalId}/decision`, staff))
      .send({ decision: 'APPROVED' })
      .expect(403);
  });

  it('records a human approval decision', async () => {
    const response = await (authed('post', `/v1/approvals/${approvalId}/decision`))
      .send({ decision: 'APPROVED', note: 'Disetujui untuk rekap mingguan' })
      .expect(201);

    expect(response.body.data.status).toBe('APPROVED');
    expect(response.body.data.decidedById).toBeTruthy();
    expect(response.body.data.decidedAt).toBeTruthy();
  });

  it('refuses a second decision on the same approval', async () => {
    await (authed('post', `/v1/approvals/${approvalId}/decision`))
      .send({ decision: 'REJECTED' })
      .expect(409);
  });

  it('records the runtime execution result', async () => {
    const response = await (authed('post', `/v1/approvals/${approvalId}/execution`))
      .send({ status: 'SUCCEEDED', summary: 'Workflow Execution dijalankan pada runtime simulasi' })
      .expect(201);

    expect(response.body.data.executionStatus).toBe('SUCCEEDED');
    expect(response.body.data.executedAt).toBeTruthy();
  });

  it('keeps an ordered audit trail of the whole flow', async () => {
    const response = await (authed('get', `/v1/audit?sessionId=${sessionId}&limit=50`)).expect(200);
    const events: Array<{ event: string; hash: string; prevHash: string }> = response.body.data;

    expect(events.map((event) => event.event)).toEqual(
      expect.arrayContaining([
        'session.created',
        'session.turn_recorded',
        'approval.requested',
        'approval.decided',
        'approval.executed',
      ]),
    );
    expect(events[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies the audit hash chain', async () => {
    const response = await (authed('get', '/v1/audit/verify')).expect(200);
    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.count).toBeGreaterThanOrEqual(5);
  });

  it('detects a tampered audit row', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `UPDATE "AuditEvent" SET payload = jsonb_set(payload::jsonb, '{decision}', '"REJECTED"')::json WHERE event = 'approval.decided'`,
      );
    } finally {
      await client.end();
    }

    const response = await (authed('get', '/v1/audit/verify')).expect(200);
    expect(response.body.data.ok).toBe(false);
    expect(response.body.data.brokenAtSequence).toBeTruthy();
  });
});

/**
 * The durable homes for what the portal used to keep in process memory.
 *
 * The point of these is not that a write returns 200 — it is that the row is
 * still there afterwards, scoped to the actor who wrote it. A governance trail
 * that a deploy erases is not a governance trail, and a task store that loses a
 * parked approval strands the human decision it was waiting for.
 */
describe('durable workspace stores', () => {
  const taskId = 'task-e2e-1';
  const approvalId = 'apr-e2e-1';

  function report(overrides: Record<string, unknown> = {}) {
    return {
      taskId,
      sessionId: 'conv-e2e-1',
      question: 'Analisa kinerja produk.',
      intent: 'ANALYZE',
      status: 'COMPLETED',
      plan: [{ id: 'a1', label: 'Jalankan', approvalId }],
      agents: ['agent.performance'],
      tools: [],
      evidence: [],
      artifacts: [],
      verification: { ok: true, issues: [], checkedAt: '2026-09-19T00:00:00.000Z' },
      result: 'Selesai.',
      errors: [],
      trace: [],
      risk: 'LOW',
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:01.000Z',
      ...overrides,
    };
  }

  it('stores a task and reads it back', async () => {
    await authed('post', '/v1/tasks')
      .send({ id: taskId, status: 'COMPLETED', approvalIds: [approvalId], report: report() })
      .expect(201);

    const response = await authed('get', `/v1/tasks/${taskId}`).expect(200);

    expect(response.body.data.id).toBe(taskId);
    expect(response.body.data.report.question).toBe('Analisa kinerja produk.');
  });

  it('survives a restart', async () => {
    // The whole point. Rows are read through a second connection rather than
    // the app, so nothing in-process can be mistaken for persistence.
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const rows = await client.query('SELECT "id", "status" FROM "Task" WHERE "id" = $1', [taskId]);
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].status).toBe('COMPLETED');
    } finally {
      await client.end();
    }
  });

  it('updates a task in place rather than duplicating it', async () => {
    await authed('post', '/v1/tasks')
      .send({ id: taskId, status: 'BLOCKED', approvalIds: [approvalId], report: report({ status: 'BLOCKED' }) })
      .expect(201);

    const response = await authed('get', `/v1/tasks/${taskId}`).expect(200);
    expect(response.body.data.status).toBe('BLOCKED');
  });

  it('finds the task an approval belongs to', async () => {
    const response = await authed('get', `/v1/tasks?approvalId=${approvalId}`).expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(taskId);
  });

  it('does not show one actor task to another', async () => {
    await authed('get', `/v1/tasks/${taskId}`, staff).expect(404);
    expect((await authed('get', '/v1/tasks', staff).expect(200)).body.data).toEqual([]);
  });

  it('refuses to let another actor overwrite a task', async () => {
    await authed('post', '/v1/tasks', staff)
      .send({ id: taskId, status: 'COMPLETED', report: report() })
      .expect(403);
  });

  it('stores memory and filters recall by clearance', async () => {
    await authed('post', '/v1/memory')
      .send({ scope: 'ACTOR', key: 'preference.language', value: 'id-ID', classification: 'INTERNAL' })
      .expect(201);

    await authed('post', '/v1/memory')
      .send({ scope: 'ACTOR', key: 'salary.band', value: 'rahasia', classification: 'RESTRICTED' })
      .expect(201);

    // Henri is CONFIDENTIAL, so the RESTRICTED record is never loaded — not
    // loaded and then dropped, which is the difference that matters the day
    // something logs what it read.
    const keys = (await authed('get', '/v1/memory?limit=50').expect(200)).body.data.map(
      (row: { key: string }) => row.key,
    );

    expect(keys).toContain('preference.language');
    expect(keys).not.toContain('salary.band');
  });

  it('honours a deletion request, and only from the owner', async () => {
    const created = await authed('post', '/v1/memory')
      .send({ scope: 'SESSION', key: 'scratch', value: 'x', classification: 'PUBLIC' })
      .expect(201);

    const id = created.body.data.id;

    await authed('delete', `/v1/memory/${id}`, staff).expect(404);
    await authed('delete', `/v1/memory/${id}`).expect(200);
    await authed('delete', `/v1/memory/${id}`).expect(404);
  });

  it('rejects a governance record that is missing a field', async () => {
    await authed('post', '/v1/governance')
      .send({ intent: 'ANALYZE', agent: 'agent.performance' })
      .expect(400);
  });

  it('stores a governance record and scopes the trail', async () => {
    const record = {
      intent: 'ANALYZE',
      agent: 'agent.performance',
      tool: 'analytics.query',
      action: 'RETRIEVE',
      result: 'SUCCEEDED',
      risk: 'LOW',
      dataAccess: { count: 1, classification: 'INTERNAL', resources: ['doc-1'], filtered: true },
      verification: { ok: true, issues: [] },
      correlationId: 'req-e2e-governance',
    };

    await authed('post', '/v1/governance').send(record).expect(201);

    const mine = await authed('get', '/v1/governance?limit=10').expect(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(mine.body.data[0].correlationId).toBe('req-e2e-governance');

    // `staff` holds no `audit:read`, so it sees only its own — which is none.
    const theirs = await authed('get', '/v1/governance?limit=10', staff).expect(200);
    expect(theirs.body.data).toEqual([]);
  });

  it('lets an auditor read the whole trail', async () => {
    const auditor = actorHeader({
      subject: 'usr_auditor',
      name: 'Auditor',
      email: 'auditor@dps.telkom.example',
      scopes: ['audit:read'],
    });

    const response = await authed('get', '/v1/governance?limit=10', auditor).expect(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });
});
