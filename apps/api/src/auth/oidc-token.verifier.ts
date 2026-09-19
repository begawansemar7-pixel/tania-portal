import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express';
import type { AppConfig, OidcConfig } from '../config/configuration.js';
import { isClearance, type VerifiedIdentity } from './actor.types.js';
import { readBearerToken, type TokenVerifier } from './token-verifier.js';

/**
 * OIDC / Microsoft Entra ID compatible verification.
 *
 * The JWKS endpoint is taken from configuration or discovered from the issuer's
 * standard `/.well-known/openid-configuration` document. Nothing is hardcoded.
 */
@Injectable()
export class OidcTokenVerifier implements TokenVerifier {
  readonly mode = 'oidc';
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: AppConfig) {}

  private get oidc(): OidcConfig {
    const oidc = this.config.auth.oidc;
    if (!oidc) {
      throw new UnauthorizedException('OIDC mode is enabled but not configured.');
    }
    return oidc;
  }

  private async getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (this.jwks) return this.jwks;

    const jwksUri = this.oidc.jwksUri ?? (await this.discoverJwksUri());
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
    return this.jwks;
  }

  private async discoverJwksUri(): Promise<string> {
    const discoveryUrl = new URL(
      '.well-known/openid-configuration',
      this.oidc.issuerUrl.endsWith('/') ? this.oidc.issuerUrl : `${this.oidc.issuerUrl}/`,
    );

    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new UnauthorizedException(
        `OIDC discovery failed with status ${response.status}. Set OIDC_JWKS_URI to skip discovery.`,
      );
    }

    const document = (await response.json()) as { jwks_uri?: string };
    if (!document.jwks_uri) {
      throw new UnauthorizedException('OIDC discovery document has no jwks_uri.');
    }
    return document.jwks_uri;
  }

  async verify(request: Request): Promise<VerifiedIdentity> {
    const token = readBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const { payload } = await jwtVerify(token, await this.getJwks(), {
        issuer: this.oidc.issuerUrl,
        audience: this.oidc.audience,
      });
      return mapClaims(payload, this.oidc);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(
        `Token verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

/** Maps standard OIDC / Entra ID claims onto the TANIA actor model. */
export function mapClaims(payload: JWTPayload, oidc: OidcConfig): VerifiedIdentity {
  const claims = payload as JWTPayload & Record<string, unknown>;

  const subject = claims.sub;
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new UnauthorizedException('Token has no `sub` claim.');
  }

  const name =
    pickString(claims.name) ?? pickString(claims.preferred_username) ?? pickString(claims.upn) ?? subject;
  const email =
    pickString(claims.email) ?? pickString(claims.preferred_username) ?? pickString(claims.upn) ?? '';

  const rawScopes = claims[oidc.scopeClaim];
  const scopes = Array.isArray(rawScopes)
    ? rawScopes.filter((scope): scope is string => typeof scope === 'string')
    : typeof rawScopes === 'string'
      ? rawScopes.split(' ').filter((scope) => scope.length > 0)
      : [];

  const clearanceClaim = oidc.clearanceClaim ? claims[oidc.clearanceClaim] : undefined;
  const unitClaim = oidc.unitClaim ? claims[oidc.unitClaim] : undefined;

  return {
    subject,
    issuer: typeof claims.iss === 'string' ? claims.iss : oidc.issuerUrl,
    name,
    email,
    unit: pickString(unitClaim),
    role: pickString(claims.jobTitle),
    clearance: isClearance(clearanceClaim) ? clearanceClaim : 'INTERNAL',
    scopes,
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
