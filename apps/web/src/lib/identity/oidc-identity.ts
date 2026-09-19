import { cookies } from 'next/headers';
import type { TaniaConfig } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { MockIdentityProvider } from './mock-identity';
import { SESSION_COOKIE, openSession, toActor } from './session';
import type { Actor, IdentityProvider } from './types';

/**
 * Resolves the actor from the portal's session cookie.
 *
 * The counterpart to `MockIdentityProvider`: same interface, but every answer
 * traces back to a token this deployment's IdP signed. No session, no actor —
 * the route handlers already treat that as `401`.
 */
export class OidcIdentityProvider implements IdentityProvider {
  readonly id = 'oidc';

  constructor(private readonly secret: string) {}

  async getActor(request?: Request): Promise<Actor | null> {
    const token = await this.readCookie(request);
    const session = await openSession(token, this.secret);

    return session === undefined ? null : toActor(session);
  }

  /**
   * Prefers the request's own cookies, falling back to Next's request-scoped
   * store.
   *
   * Both exist because both callers exist: a route handler holds a `Request`,
   * while a server component has only `cookies()`. Reading the `Request` first
   * keeps the two in agreement inside a single handler.
   */
  private async readCookie(request?: Request): Promise<string | undefined> {
    if (request !== undefined) {
      const header = request.headers.get('cookie');
      if (header !== null) return parseCookie(header, SESSION_COOKIE);
    }

    try {
      return (await cookies()).get(SESSION_COOKIE)?.value;
    } catch {
      // Outside a request scope — no session to read.
      return undefined;
    }
  }
}

export function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

/**
 * Resolves nobody, loudly.
 *
 * What a production deployment gets when it asked for the development
 * stand-in. Returning `null` rather than throwing is deliberate: every route
 * already treats "no actor" as `401`, so the portal fails closed on every
 * request instead of returning a 500 that looks like a bug in the handler. The
 * reason is logged once at construction and reported by `/api/ready`, so an
 * operator sees the cause rather than a wall of unauthorised requests.
 */
export class RefusingIdentityProvider implements IdentityProvider {
  readonly id = 'refusing';

  async getActor(): Promise<Actor | null> {
    return null;
  }
}

/**
 * Chooses the provider for this deployment.
 *
 * The mock resolves every visitor to one actor holding every scope,
 * `workflow:approve` included. That is a development convenience and a
 * production breach, so in production it is replaced by a provider that
 * authenticates nobody at all.
 */
export function createIdentityProvider(cfg: TaniaConfig): IdentityProvider {
  if (cfg.auth.mode === 'oidc') {
    logger.info('auth.provider_selected', { provider: 'oidc', issuer: cfg.auth.oidc?.issuer });
    return new OidcIdentityProvider(cfg.auth.session.secret);
  }

  if (cfg.auth.insecure) {
    logger.error('auth.refused_insecure_mode', {
      reason:
        'TANIA_AUTH_MODE=mock would resolve every visitor to one actor holding every scope, including workflow:approve. ' +
        'Refused in production: nobody is authenticated. Set TANIA_AUTH_MODE=oidc and configure TANIA_OIDC_*.',
    });
    return new RefusingIdentityProvider();
  }

  logger.warn('auth.mock_provider', {
    reason:
      'TANIA_AUTH_MODE=mock resolves every visitor to one actor holding every scope, including workflow:approve. Development only.',
  });

  return new MockIdentityProvider();
}
