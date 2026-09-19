import { describe, expect, it } from 'vitest';
import { ENV_SCHEMA, ConfigurationError, resolveAuth } from '@/lib/config/env';
import { loadEnv } from '@tania/config';
import {
  SESSION_COOKIE,
  openSession,
  sealSession,
  toActor,
  type SessionActor,
} from '@/lib/identity/session';
import {
  OidcIdentityProvider,
  createIdentityProvider,
  parseCookie,
} from '@/lib/identity/oidc-identity';
import { safeReturnTo } from '@/lib/identity/return-to';
import { actorFromClaims, statesMatch } from '@/lib/identity/oidc';
import type { OidcPortalConfig } from '@/lib/config/env';

/**
 * The portal used to resolve every visitor to one actor holding every scope,
 * `workflow:approve` included — so anyone could approve their own high-risk
 * action and the governance layer above it was ceremony. These tests cover the
 * two halves of the fix: a configuration that cannot express the dangerous
 * combination in production, and a session that cannot be forged.
 */

const SECRET = 'a-test-session-secret-of-sufficient-length-32+';

function env(overrides: Record<string, string>) {
  return loadEnv(ENV_SCHEMA, {
    NODE_ENV: 'development',
    TANIA_SESSION_SECRET: SECRET,
    ...overrides,
  });
}

const OIDC: OidcPortalConfig = {
  issuer: 'https://login.example/tenant',
  clientId: 'tania-portal',
  clientSecret: 'secret',
  redirectUri: 'https://tania.example/api/auth/callback',
  scopes: 'openid profile email',
  rolesClaim: 'roles',
};

function session(overrides: Partial<SessionActor> = {}): SessionActor {
  return {
    subject: 'usr-1',
    issuer: 'https://login.example/tenant',
    name: 'Henri',
    email: 'henri@dps.telkom.example',
    clearance: 'INTERNAL',
    scopes: ['knowledge:read'],
    ...overrides,
  };
}

describe('authentication configuration', () => {
  it('marks the mock provider insecure in production', () => {
    // Flagged rather than thrown: this same code runs during `next build`, on
    // a machine that has no identity provider and needs none. Enforcement is
    // at the point of use — see the provider tests below.
    expect(resolveAuth(env({ NODE_ENV: 'production', TANIA_AUTH_MODE: 'mock' })).insecure).toBe(
      true,
    );
  });

  it('allows the mock provider in development', () => {
    const auth = resolveAuth(env({ TANIA_AUTH_MODE: 'mock' }));

    expect(auth.mode).toBe('mock');
    expect(auth.insecure).toBe(false);
  });

  it('needs no configuration at all to run in development', () => {
    expect(resolveAuth(loadEnv(ENV_SCHEMA, {})).mode).toBe('mock');
  });

  it('refuses OIDC that is only half described', () => {
    expect(() =>
      resolveAuth(env({ TANIA_AUTH_MODE: 'oidc', TANIA_OIDC_ISSUER: OIDC.issuer })),
    ).toThrow(/TANIA_OIDC_CLIENT_ID/);
  });

  it('names every missing setting at once', () => {
    try {
      resolveAuth(env({ TANIA_AUTH_MODE: 'oidc' }));
      expect.unreachable('expected a refusal');
    } catch (error) {
      const message = (error as Error).message;
      for (const key of ['TANIA_OIDC_ISSUER', 'TANIA_OIDC_CLIENT_ID', 'TANIA_OIDC_REDIRECT_URI']) {
        expect(message).toContain(key);
      }
    }
  });

  it('refuses a session secret short enough to brute force', () => {
    expect(() =>
      resolveAuth(
        env({
          TANIA_AUTH_MODE: 'oidc',
          TANIA_OIDC_ISSUER: OIDC.issuer,
          TANIA_OIDC_CLIENT_ID: OIDC.clientId,
          TANIA_OIDC_CLIENT_SECRET: OIDC.clientSecret,
          TANIA_OIDC_REDIRECT_URI: OIDC.redirectUri,
          TANIA_SESSION_SECRET: 'short',
        }),
      ),
    ).toThrow(/at least 32/);
  });

  it('accepts a complete OIDC configuration', () => {
    const auth = resolveAuth(
      env({
        NODE_ENV: 'production',
        TANIA_AUTH_MODE: 'oidc',
        TANIA_OIDC_ISSUER: OIDC.issuer,
        TANIA_OIDC_CLIENT_ID: OIDC.clientId,
        TANIA_OIDC_CLIENT_SECRET: OIDC.clientSecret,
        TANIA_OIDC_REDIRECT_URI: OIDC.redirectUri,
      }),
    );

    expect(auth.mode).toBe('oidc');
    expect(auth.oidc?.issuer).toBe(OIDC.issuer);
  });
});

describe('the provider a deployment actually gets', () => {
  function cfg(overrides: Record<string, string>) {
    return { auth: resolveAuth(env(overrides)) } as unknown as Parameters<
      typeof createIdentityProvider
    >[0];
  }

  it('authenticates nobody when production asked for the mock', async () => {
    // The heart of C1: in production the fully privileged stand-in is replaced
    // by a provider that resolves no one, so every route answers 401.
    const provider = createIdentityProvider(
      cfg({ NODE_ENV: 'production', TANIA_AUTH_MODE: 'mock' }),
    );

    expect(provider.id).toBe('refusing');
    expect(await provider.getActor(new Request('https://tania.example/'))).toBeNull();
  });

  it('still gives developers the mock actor outside production', async () => {
    const provider = createIdentityProvider(cfg({ TANIA_AUTH_MODE: 'mock' }));

    expect(provider.id).toBe('mock');
    expect(await provider.getActor(new Request('http://localhost:3000/'))).not.toBeNull();
  });

  it('uses the session provider when OIDC is configured', () => {
    const provider = createIdentityProvider(
      cfg({
        NODE_ENV: 'production',
        TANIA_AUTH_MODE: 'oidc',
        TANIA_OIDC_ISSUER: OIDC.issuer,
        TANIA_OIDC_CLIENT_ID: OIDC.clientId,
        TANIA_OIDC_CLIENT_SECRET: OIDC.clientSecret,
        TANIA_OIDC_REDIRECT_URI: OIDC.redirectUri,
      }),
    );

    expect(provider.id).toBe('oidc');
  });
});

describe('the session cookie', () => {
  it('round-trips an actor', async () => {
    const sealed = await sealSession(session(), SECRET, 3600);

    expect(await openSession(sealed, SECRET)).toMatchObject({
      subject: 'usr-1',
      scopes: ['knowledge:read'],
    });
  });

  it('refuses a cookie signed with another secret', async () => {
    const sealed = await sealSession(session(), 'a-different-secret-of-sufficient-length!!', 3600);

    expect(await openSession(sealed, SECRET)).toBeUndefined();
  });

  it('refuses a tampered payload', async () => {
    // The attack the signature exists to stop: editing your own scopes.
    const sealed = await sealSession(session(), SECRET, 3600);
    const [header, payload, signature] = sealed.split('.');
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as SessionActor;
    decoded.scopes = ['system:admin'];
    const forged = [
      header,
      Buffer.from(JSON.stringify(decoded)).toString('base64url'),
      signature,
    ].join('.');

    expect(await openSession(forged, SECRET)).toBeUndefined();
  });

  it('refuses an expired cookie', async () => {
    const sealed = await sealSession(session(), SECRET, 300);
    // jose rejects anything whose `exp` has passed; -1s is already past.
    const expired = await sealSession(session(), SECRET, -1 as unknown as number);

    expect(await openSession(sealed, SECRET)).toBeDefined();
    expect(await openSession(expired, SECRET)).toBeUndefined();
  });

  it('refuses nonsense', async () => {
    for (const token of ['', 'not-a-jwt', 'a.b.c']) {
      expect(await openSession(token, SECRET)).toBeUndefined();
    }
  });

  it('refuses a validly signed cookie whose claims are malformed', async () => {
    // A secret shared with another deployment, or an older release's payload,
    // still verifies — the shape has to be re-checked.
    const { SignJWT } = await import('jose');
    const odd = await new SignJWT({ subject: 'usr-1', clearance: 'GOD_MODE' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('urn:tania:portal')
      .setAudience('urn:tania:portal')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));

    expect(await openSession(odd, SECRET)).toBeUndefined();
  });

  it('gives an actor an id that is unique across issuers', () => {
    const a = toActor(session({ issuer: 'https://idp-a', subject: 'shared' }));
    const b = toActor(session({ issuer: 'https://idp-b', subject: 'shared' }));

    expect(a.id).not.toBe(b.id);
  });
});

describe('OidcIdentityProvider', () => {
  const provider = new OidcIdentityProvider(SECRET);

  function requestWithCookie(value: string): Request {
    return new Request('https://tania.example/api/tania/chat', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(value)}` },
    });
  }

  it('resolves nobody without a cookie', async () => {
    expect(await provider.getActor(new Request('https://tania.example/'))).toBeNull();
  });

  it('resolves nobody from a forged cookie', async () => {
    expect(await provider.getActor(requestWithCookie('forged'))).toBeNull();
  });

  it('resolves the actor a valid session names', async () => {
    const sealed = await sealSession(session({ scopes: ['knowledge:read'] }), SECRET, 3600);

    const actor = await provider.getActor(requestWithCookie(sealed));

    expect(actor?.subject).toBe('usr-1');
    expect(actor?.scopes).toEqual(['knowledge:read']);
    // Never the development actor's full set.
    expect(actor?.scopes).not.toContain('workflow:approve');
  });
});

describe('claim mapping', () => {
  it('derives scopes from group claims, never from the token', () => {
    // A token that names portal scopes directly must not be believed: that
    // would move authorisation out of this codebase and into whoever can edit
    // a directory claim.
    const actor = actorFromClaims(
      { sub: 'usr-1', roles: ['viewer'], scopes: ['system:admin'] },
      OIDC,
    );

    expect(actor.scopes).not.toContain('system:admin');
    expect(actor.scopes).toContain('knowledge:read');
  });

  it('grants nothing when no known group is claimed', () => {
    const actor = actorFromClaims({ sub: 'usr-1', roles: ['unmapped-group'] }, OIDC);

    expect(actor.scopes).toEqual([]);
  });

  it('separates running from approving, as the role table does', () => {
    const operator = actorFromClaims({ sub: 'a', roles: ['operator'] }, OIDC);

    expect(operator.scopes).toContain('workflow:run');
    expect(operator.scopes).not.toContain('workflow:approve');
  });

  it('defaults clearance to INTERNAL rather than to the actor convenience', () => {
    expect(actorFromClaims({ sub: 'usr-1' }, OIDC).clearance).toBe('INTERNAL');
    expect(
      actorFromClaims({ sub: 'usr-1', clr: 'RESTRICTED' }, { ...OIDC, clearanceClaim: 'clr' })
        .clearance,
    ).toBe('RESTRICTED');
    // An unrecognised value is not trusted upward.
    expect(
      actorFromClaims({ sub: 'usr-1', clr: 'GOD_MODE' }, { ...OIDC, clearanceClaim: 'clr' })
        .clearance,
    ).toBe('INTERNAL');
  });

  it('refuses a token with no subject', () => {
    expect(() => actorFromClaims({ roles: ['viewer'] }, OIDC)).toThrow();
  });

  it('accepts a space-separated roles claim', () => {
    expect(actorFromClaims({ sub: 'a', roles: 'viewer analyst' }, OIDC).scopes).toContain(
      'analytics:read',
    );
  });
});

describe('redirect safety', () => {
  it('keeps a relative path', () => {
    expect(safeReturnTo('/dashboard')).toBe('/dashboard');
  });

  it('refuses anything that would leave the site', () => {
    // An open redirect here would borrow the portal's credibility for a
    // phishing link that passes through a real sign-in.
    for (const hostile of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(safeReturnTo(hostile), String(hostile)).toBe('/');
    }
  });
});

describe('state comparison', () => {
  it('matches only an identical state', () => {
    expect(statesMatch('abc', 'abc')).toBe(true);
    expect(statesMatch('abc', 'abd')).toBe(false);
    expect(statesMatch('abc', 'abcd')).toBe(false);
  });
});

describe('cookie parsing', () => {
  it('reads the named cookie from a crowded header', () => {
    expect(parseCookie('a=1; tania_session=xyz; b=2', SESSION_COOKIE)).toBe('xyz');
  });

  it('does not match a cookie whose name merely ends the same way', () => {
    expect(parseCookie('other_tania_session=xyz', SESSION_COOKIE)).toBeUndefined();
  });
});
