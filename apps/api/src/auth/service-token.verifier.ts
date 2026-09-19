import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../config/configuration.js';
import { StructuredLogger } from '../common/logger.service.js';
import { isClearance, type VerifiedIdentity } from './actor.types.js';
import { readBearerToken, type TokenVerifier } from './token-verifier.js';

const ACTOR_HEADER = 'x-tania-actor';

/**
 * Trusted first-party service mode.
 *
 * The caller (Portal TANIA) proves itself with a shared service token and
 * asserts which end user it is acting for. Use OIDC mode once the portal can
 * forward a real user token.
 */
@Injectable()
export class ServiceTokenVerifier implements TokenVerifier {
  readonly mode = 'service';
  private warnedAboutMissingToken = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: StructuredLogger,
  ) {}

  async verify(request: Request): Promise<VerifiedIdentity> {
    const expected = this.config.auth.serviceToken;

    if (expected) {
      const presented = readBearerToken(request);
      if (!presented || !timingSafeEqual(presented, expected)) {
        throw new UnauthorizedException('Invalid or missing service token.');
      }
    } else if (!this.warnedAboutMissingToken) {
      this.warnedAboutMissingToken = true;
      this.logger.warn(
        'auth.service_token_not_set: TANIA_SERVICE_TOKEN is unset, every caller is trusted. Set it outside local development.',
        'auth',
      );
    }

    return parseActorAssertion(request.headers[ACTOR_HEADER], this.config.auth.assertionIssuer);
  }
}

export function parseActorAssertion(
  header: string | string[] | undefined,
  issuer: string,
): VerifiedIdentity {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) {
    throw new UnauthorizedException(`Missing ${ACTOR_HEADER} assertion header.`);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedException(`${ACTOR_HEADER} must be base64url-encoded JSON.`);
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new UnauthorizedException(`${ACTOR_HEADER} must decode to an object.`);
  }

  const claims = decoded as Record<string, unknown>;
  const subject = claims.subject;
  const name = claims.name;
  const email = claims.email;

  if (typeof subject !== 'string' || subject.length === 0) {
    throw new UnauthorizedException('Actor assertion requires a non-empty `subject`.');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new UnauthorizedException('Actor assertion requires a non-empty `name`.');
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new UnauthorizedException('Actor assertion requires a valid `email`.');
  }

  const scopes = Array.isArray(claims.scopes)
    ? claims.scopes.filter((scope): scope is string => typeof scope === 'string')
    : [];

  return {
    subject,
    issuer,
    name,
    email,
    unit: typeof claims.unit === 'string' ? claims.unit : undefined,
    role: typeof claims.role === 'string' ? claims.role : undefined,
    clearance: isClearance(claims.clearance) ? claims.clearance : 'INTERNAL',
    scopes,
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
