import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ServiceTokenVerifier, parseActorAssertion } from './service-token.verifier.js';
import { StructuredLogger } from '../common/logger.service.js';
import type { AppConfig } from '../config/configuration.js';

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

const actorAssertion = encode({
  subject: 'usr_henri',
  name: 'Henri',
  email: 'henri@dps.telkom.example',
  unit: 'DPS Team',
  clearance: 'CONFIDENTIAL',
  scopes: ['knowledge:read', 'workflow:approve'],
});

function makeRequest(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

function makeConfig(serviceToken?: string): AppConfig {
  return {
    service: 'tania.api',
    version: '0.1.0',
    environment: 'test',
    logLevel: 'error',
    port: 4000,
    databaseUrl: 'postgresql://localhost:5432/db',
    corsOrigins: [],
    auth: { mode: 'service', serviceToken, assertionIssuer: 'urn:tania:portal' },
    governance: { approvalThreshold: 'HIGH', requireSeparateApprover: false },
  };
}

/** Logger wired to the same test configuration; emits at error level only. */
function makeLogger(): StructuredLogger {
  return new StructuredLogger(makeConfig());
}

describe('parseActorAssertion', () => {
  it('decodes a valid assertion', () => {
    const identity = parseActorAssertion(actorAssertion, 'urn:tania:portal');
    expect(identity.subject).toBe('usr_henri');
    expect(identity.issuer).toBe('urn:tania:portal');
    expect(identity.clearance).toBe('CONFIDENTIAL');
    expect(identity.scopes).toContain('workflow:approve');
  });

  it('defaults clearance to INTERNAL when absent or invalid', () => {
    const identity = parseActorAssertion(
      encode({ subject: 's', name: 'n', email: 'a@b.c', clearance: 'TOP_SECRET' }),
      'urn:tania:portal',
    );
    expect(identity.clearance).toBe('INTERNAL');
  });

  const invalidAssertions: Array<[string, string | undefined]> = [
    ['missing header', undefined],
    ['malformed payload', 'not-base64-json'],
    ['missing subject', encode({ name: 'n', email: 'a@b.c' })],
    ['invalid email', encode({ subject: 's', name: 'n', email: 'nope' })],
  ];

  it.each(invalidAssertions)('rejects an assertion with a %s', (_label, header) => {
    expect(() => parseActorAssertion(header, 'urn:tania:portal')).toThrow(UnauthorizedException);
  });
});

describe('ServiceTokenVerifier', () => {
  it('rejects a wrong service token', async () => {
    const verifier = new ServiceTokenVerifier(makeConfig('right'), makeLogger());
    await expect(
      verifier.verify(
        makeRequest({ authorization: 'Bearer wrong', 'x-tania-actor': actorAssertion }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts the configured service token with an actor assertion', async () => {
    const verifier = new ServiceTokenVerifier(makeConfig('right'), makeLogger());
    const identity = await verifier.verify(
      makeRequest({ authorization: 'Bearer right', 'x-tania-actor': actorAssertion }),
    );
    expect(identity.name).toBe('Henri');
  });

  it('still requires an actor assertion when no service token is configured', async () => {
    const verifier = new ServiceTokenVerifier(makeConfig(undefined), makeLogger());
    await expect(verifier.verify(makeRequest({}))).rejects.toThrow(UnauthorizedException);
  });
});
