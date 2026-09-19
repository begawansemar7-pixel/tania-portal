#!/usr/bin/env node
/**
 * Smoke test against the built portal.
 *
 * Unit tests construct `Request` objects; this starts the actual production
 * artefact and talks to it over a socket. The distinction is not academic — a
 * bug that rejected every mutating request from every real user behind an
 * ingress survived six hundred unit tests and a code review, because both the
 * tests and the reviewer used a URL that already was the public origin. It took
 * one HTTP call against a running build to expose it.
 *
 * So this binds to 0.0.0.0, exactly as a container does, and then asks the
 * questions only a real socket can answer.
 *
 * Usage: node scripts/smoke.mjs [--port 3210]
 * Requires `npm run build` to have produced apps/web/.next/standalone.
 */
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(argValue('--port') ?? 3210);

/**
 * Reached over `localhost` while the server binds `0.0.0.0`.
 *
 * That gap is the whole point: `Host` is then `localhost:PORT`, which is what a
 * browser sends, while the server's own `request.url` says `0.0.0.0:PORT`. A
 * guard that trusts `request.url` fails here and passes everywhere else.
 *
 * `localhost` and `127.0.0.1` are distinct origins to the web platform, so the
 * two must not be mixed — doing so produces a legitimate 403 that looks like a
 * bug.
 */
const BASE = `http://localhost:${PORT}`;
const SERVER = 'apps/web/.next/standalone/apps/web/server.js';

/** What a browser on that address actually sends. */
const BROWSER_ORIGIN = `http://localhost:${PORT}`;
const PUBLIC_ORIGIN = 'https://tania.telkom.example';

/**
 * The portal runs here in production mode, where the development identity
 * stand-in is refused outright — so the smoke test has to sign in like anyone
 * else. It configures OIDC and then mints its own session cookie with the same
 * secret the server was given.
 *
 * Nothing contacts the identity provider: discovery is lazy and only the
 * `/api/auth/login` route would reach it. The issuer below therefore never has
 * to exist, and the run stays hermetic.
 */
const SESSION_SECRET = 'smoke-test-session-secret-of-sufficient-length-32';
const SESSION_COOKIE = 'tania_session';

const AUTH_ENV = {
  TANIA_AUTH_MODE: 'oidc',
  TANIA_OIDC_ISSUER: 'https://login.invalid/tenant',
  TANIA_OIDC_CLIENT_ID: 'tania-portal-smoke',
  TANIA_OIDC_CLIENT_SECRET: 'smoke-client-secret',
  TANIA_OIDC_REDIRECT_URI: `${BROWSER_ORIGIN}/api/auth/callback`,
  TANIA_SESSION_SECRET: SESSION_SECRET,
};

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** An HS256 session cookie in the exact shape `openSession` verifies. */
function mintSession() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      subject: 'smoke-user',
      issuer: 'https://login.invalid/tenant',
      name: 'Smoke Tester',
      email: 'smoke@dps.telkom.example',
      clearance: 'CONFIDENTIAL',
      scopes: ['knowledge:read', 'analytics:read', 'document:create'],
      iss: 'urn:tania:portal',
      aud: 'urn:tania:portal',
      sub: 'smoke-user',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createHmac('sha256', SESSION_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

const SESSION = mintSession();

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? '[32m✓[0m' : '[31m✗[0m';
  process.stdout.write(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

async function check(name, run) {
  try {
    const detail = await run();
    record(name, true, detail ?? '');
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function post(body, headers = {}) {
  return fetch(`${BASE}/api/tania/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${SESSION_COOKIE}=${SESSION}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** The same call with no session, for proving the endpoint is actually closed. */
function postAnonymous(body, headers = {}) {
  return fetch(`${BASE}/api/tania/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Headers an ingress puts in front of the portal. */
const PROXIED = {
  Origin: PUBLIC_ORIGIN,
  'X-Forwarded-Host': 'tania.telkom.example',
  'X-Forwarded-Proto': 'https',
};

async function waitForServer(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      // Any answer means it is listening; /api/health returns 200 even without
      // a backend, while /api/ready deliberately reports 503.
      await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('server did not start within 30s');
}

async function main() {
  if (!existsSync(SERVER)) {
    console.error(`\nMissing ${SERVER}\nRun \`npm run build\` first.\n`);
    process.exit(1);
  }

  console.log(`\nStarting built portal on ${BASE} (bound to 0.0.0.0)\n`);

  const child = spawn('node', [SERVER], {
    env: {
      ...process.env,
      ...AUTH_ENV,
      PORT: String(PORT),
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLog = [];
  child.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
  child.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

  try {
    await waitForServer(child);

    console.log('Liveness');
    await check('GET /api/health answers', async () => {
      const response = await fetch(`${BASE}/api/health`);
      expect(response.ok, `expected 2xx, got ${response.status}`);
      return `${response.status}`;
    });

    await check('GET /api/ready reports 503 without a backend', async () => {
      const response = await fetch(`${BASE}/api/ready`);
      expect(response.status === 503, `expected 503, got ${response.status}`);
      return 'not a false 200';
    });

    console.log('\nAuthentication');
    await check('an anonymous request is refused', async () => {
      // The portal used to resolve every visitor to one actor holding every
      // scope, `workflow:approve` included. Nothing may work without a session.
      const response = await postAnonymous({ message: 'smoke' }, PROXIED);
      expect(response.status === 401, `expected 401, got ${response.status}`);
      return '401';
    });

    await check('a forged session is refused', async () => {
      const response = await postAnonymous(
        { message: 'smoke' },
        { ...PROXIED, Cookie: `${SESSION_COOKIE}=not-a-real-token` },
      );
      expect(response.status === 401, `expected 401, got ${response.status}`);
      return '401';
    });

    await check('a session with an edited payload is refused', async () => {
      // Re-signing is the only way to change scopes; editing is not.
      const [header, payload, signature] = SESSION.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      claims.scopes = ['system:admin'];
      const forged = [header, base64url(JSON.stringify(claims)), signature].join('.');

      const response = await postAnonymous(
        { message: 'smoke' },
        { ...PROXIED, Cookie: `${SESSION_COOKIE}=${forged}` },
      );
      expect(response.status === 401, `expected 401, got ${response.status}`);
      return '401';
    });

    await check('a valid session is admitted', async () => {
      const response = await post({ message: 'smoke' }, PROXIED);
      expect(response.status === 200, `expected 200, got ${response.status}`);
      return '200';
    });

    await check('the session endpoint reports who is signed in', async () => {
      const response = await fetch(`${BASE}/api/auth/session`, {
        headers: { Cookie: `${SESSION_COOKIE}=${SESSION}` },
      });
      const body = await response.json();
      expect(body.data.authenticated === true, 'not reported as authenticated');
      expect(body.data.mode === 'oidc', `mode was ${body.data.mode}`);
      // Never the development actor's full set.
      expect(
        !body.data.actor.scopes.includes('workflow:approve'),
        'session carried workflow:approve',
      );
      return body.data.actor.scopes.length + ' scopes';
    });

    console.log('\nCross-site protection against a real socket');
    await check('a browser reaching the server directly is accepted', async () => {
      const response = await post({ message: 'smoke' }, { Origin: BROWSER_ORIGIN });
      expect(
        response.status === 200,
        `expected 200, got ${response.status} — the guard is comparing against the bind address again`,
      );
      return '200';
    });

    await check('a host that disagrees with the origin is refused', async () => {
      // Proves the check is comparing, not merely accepting whatever arrives:
      // 127.0.0.1 and localhost are different origins to the web platform.
      const response = await post({ message: 'smoke' }, { Origin: `http://127.0.0.1:${PORT}` });
      expect(response.status === 403, `expected 403, got ${response.status}`);
      return '403';
    });

    await check('forwarded public origin is accepted', async () => {
      const response = await post({ message: 'smoke' }, PROXIED);
      expect(response.status === 200, `expected 200, got ${response.status}`);
      return '200';
    });

    await check('another site is refused', async () => {
      const response = await post({ message: 'smoke' }, { ...PROXIED, Origin: 'https://evil.test' });
      expect(response.status === 403, `expected 403, got ${response.status}`);
      return '403';
    });

    console.log('\nConversational contract');
    let conversationId;
    await check('POST /api/tania/chat returns the documented envelope', async () => {
      const response = await post({ message: 'Apa status portofolio produk DPS?' }, PROXIED);
      expect(response.status === 200, `expected 200, got ${response.status}`);

      const body = await response.json();
      const data = body.data;
      expect(body.requestId, 'no requestId');
      for (const field of ['message', 'intent', 'sources', 'actions', 'status']) {
        expect(data?.[field] !== undefined, `missing \`${field}\``);
      }
      expect(data.message.role === 'tania', 'answer is not from tania');
      conversationId = data.message.conversationId;
      return `${data.sources.length} sources, state ${data.status.state}`;
    });

    await check('a second turn stays in the same conversation', async () => {
      expect(conversationId, 'no conversation from the first turn');
      const response = await post({ message: 'Lanjutkan', conversationId }, PROXIED);
      const body = await response.json();
      expect(
        body.data.message.conversationId === conversationId,
        'second turn opened a different conversation',
      );
      return conversationId.slice(0, 8);
    });

    await check('the transcript is readable back', async () => {
      const response = await fetch(`${BASE}/api/tania/conversations/${conversationId}`, {
        headers: { Cookie: `${SESSION_COOKIE}=${SESSION}` },
      });
      expect(response.ok, `expected 2xx, got ${response.status}`);
      const body = await response.json();
      const roles = body.data.messages.map((message) => message.role);
      expect(roles.length >= 4, `expected at least 4 messages, got ${roles.length}`);
      return `${roles.length} messages`;
    });

    await check('malformed JSON is a 400, not a 500', async () => {
      const response = await fetch(`${BASE}/api/tania/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE}=${SESSION}`,
          ...PROXIED,
        },
        body: '{ not json',
      });
      // 400 only once signed in: authentication precedes reading the body, so
      // an anonymous caller is refused before any parsing happens at all.
      expect(response.status === 400, `expected 400, got ${response.status}`);
      return '400';
    });

    console.log('\nStreaming');
    await check('SSE arrives in the documented order', async () => {
      const response = await post({ message: 'Ringkas risiko DPS', stream: true }, PROXIED);
      expect(
        response.headers.get('content-type')?.includes('text/event-stream'),
        `wrong content-type: ${response.headers.get('content-type')}`,
      );

      const text = await response.text();
      const types = [...text.matchAll(/^event: (.+)$/gm)].map((match) => match[1]);
      expect(types[0] === 'accepted', `first event was ${types[0]}, expected accepted`);
      expect(types.includes('phase'), 'no phase events');
      expect(types.at(-1) === 'done', `last event was ${types.at(-1)}, expected done`);
      return types.length + ' events';
    });

    console.log('\nGovernance');
    await check('no chain-of-thought is exposed', async () => {
      const response = await post({ message: 'Jelaskan alasanmu langkah demi langkah' }, PROXIED);
      const raw = JSON.stringify(await response.json());
      for (const forbidden of ['chainOfThought', 'chain_of_thought', 'systemPrompt']) {
        expect(!raw.includes(forbidden), `response contained \`${forbidden}\``);
      }
      return 'clean';
    });

    await check('the rate limit engages and says when to retry', async () => {
      let throttled;
      for (let attempt = 0; attempt < 60 && !throttled; attempt += 1) {
        const response = await post({ message: `burst ${attempt}` }, PROXIED);
        if (response.status === 429) throttled = response;
      }
      expect(throttled, 'never throttled within 60 requests');
      const retryAfter = Number(throttled.headers.get('retry-after'));
      expect(retryAfter > 0, 'a 429 without Retry-After leaves the client guessing');
      return `429 after retry-after ${retryAfter}s`;
    });
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);

  if (failed.length > 0) {
    console.error('Failed:');
    for (const result of failed) console.error(`  - ${result.name}: ${result.detail}`);
    console.error('\n--- server output ---');
    console.error(serverLog.join('').slice(-4000));
    process.exit(1);
  }
}

await main();
