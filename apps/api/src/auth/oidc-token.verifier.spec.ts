import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { mapClaims } from './oidc-token.verifier.js';
import type { OidcConfig } from '../config/configuration.js';

const oidc: OidcConfig = {
  issuerUrl: 'https://login.example/tenant/v2.0',
  audience: 'api://tania',
  scopeClaim: 'roles',
  clearanceClaim: 'extension_clearance',
  unitClaim: 'department',
};

describe('mapClaims', () => {
  it('maps Entra ID style claims onto the actor model', () => {
    const identity = mapClaims(
      {
        sub: 'abc-123',
        iss: 'https://login.example/tenant/v2.0',
        name: 'Henri',
        preferred_username: 'henri@dps.telkom.example',
        roles: ['knowledge:read', 'workflow:approve'],
        extension_clearance: 'CONFIDENTIAL',
        department: 'DPS Team',
      },
      oidc,
    );

    expect(identity.subject).toBe('abc-123');
    expect(identity.email).toBe('henri@dps.telkom.example');
    expect(identity.scopes).toEqual(['knowledge:read', 'workflow:approve']);
    expect(identity.clearance).toBe('CONFIDENTIAL');
    expect(identity.unit).toBe('DPS Team');
  });

  it('accepts a space separated scope claim', () => {
    const identity = mapClaims(
      { sub: 's', name: 'n', email: 'a@b.c', roles: 'knowledge:read analytics:read' },
      oidc,
    );
    expect(identity.scopes).toEqual(['knowledge:read', 'analytics:read']);
  });

  it('falls back to INTERNAL clearance when the claim is absent', () => {
    const identity = mapClaims({ sub: 's', name: 'n', email: 'a@b.c' }, oidc);
    expect(identity.clearance).toBe('INTERNAL');
    expect(identity.scopes).toEqual([]);
  });

  it('rejects a token without a subject', () => {
    expect(() => mapClaims({ name: 'n' }, oidc)).toThrow(UnauthorizedException);
  });
});
