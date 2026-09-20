import { describe, expect, it } from 'vitest';
import { resolveAuth, type Env } from '@/lib/config/env';
import { createIdentityProvider } from '@/lib/identity/oidc-identity';
import type { TaniaConfig } from '@/lib/config/env';

/**
 * The evaluation door, and the walls around it.
 *
 * A production build normally refuses to authenticate anyone when the identity
 * mode is `mock`, because mock resolves every visitor to one actor holding
 * every scope. `TANIA_INSECURE_DEMO` opens that door on purpose for evaluation
 * deployments, which are built with NODE_ENV=production like any other.
 *
 * The risk is obvious, so what matters is that the door is narrow: it opens
 * only for `mock`, only when set deliberately, and never quietly.
 */

function env(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'production',
    TANIA_AUTH_MODE: 'mock',
    TANIA_INSECURE_DEMO: false,
    TANIA_SESSION_TTL_SECONDS: 3600,
    ...overrides,
  } as Env;
}

describe('production with mock identity', () => {
  it('refuses to authenticate anyone when the risk was not acknowledged', () => {
    const auth = resolveAuth(env());

    expect(auth.insecure).toBe(true);
    expect(auth.demo).toBeFalsy();
  });

  it('hands back a provider that authenticates nobody', () => {
    const provider = createIdentityProvider({ auth: resolveAuth(env()) } as TaniaConfig);

    expect(provider.id).toBe('refusing');
  });
});

describe('the demo opt-in', () => {
  it('permits mock identity once it is acknowledged', () => {
    const auth = resolveAuth(env({ TANIA_INSECURE_DEMO: true }));

    expect(auth.insecure).toBe(false);
    expect(auth.demo).toBe(true);
  });

  it('serves the mock actor so an evaluator can actually use the portal', () => {
    const provider = createIdentityProvider({
      auth: resolveAuth(env({ TANIA_INSECURE_DEMO: true })),
    } as TaniaConfig);

    expect(provider.id).not.toBe('refusing');
  });

  it('cannot rescue a half-configured OIDC deployment', () => {
    // The dangerous misreading: that this flag means "serve anyway". It must
    // not turn a broken real-identity deployment into an open one.
    expect(() =>
      resolveAuth(env({ TANIA_AUTH_MODE: 'oidc', TANIA_INSECURE_DEMO: true })),
    ).toThrow(/requires/);
  });

  it('changes nothing outside a production build', () => {
    // Development already uses the mock; the flag must not be load-bearing
    // anywhere a developer would notice its absence.
    const withFlag = resolveAuth(env({ NODE_ENV: 'development', TANIA_INSECURE_DEMO: true }));
    const without = resolveAuth(env({ NODE_ENV: 'development' }));

    expect(withFlag.insecure).toBe(false);
    expect(without.insecure).toBe(false);
    expect(withFlag.demo).toBeFalsy();
  });

  it('is off unless it is set', () => {
    // A default of "on" would make every future production deployment open.
    expect(resolveAuth(env()).demo).toBeFalsy();
  });
});
