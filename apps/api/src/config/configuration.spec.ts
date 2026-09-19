import { describe, expect, it } from 'vitest';
import { EnvValidationError, type EnvSource } from '@tania/config';
import { ConfigurationError, describeConfiguration, loadConfiguration } from './configuration.js';

const base: EnvSource = { DATABASE_URL: 'postgresql://user:pw@localhost:5432/db' };

describe('loadConfiguration', () => {
  it('requires a database url', () => {
    expect(() => loadConfiguration({})).toThrow(EnvValidationError);
  });

  it('defaults to service auth mode with safe values', () => {
    const config = loadConfiguration({ ...base });

    expect(config.service).toBe('tania.api');
    expect(config.auth.mode).toBe('service');
    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe('info');
    expect(config.corsOrigins).toEqual(['http://localhost:3000']);
    expect(config.governance.approvalThreshold).toBe('HIGH');
    expect(config.governance.requireSeparateApprover).toBe(false);
    expect(config.auth.oidc).toBeUndefined();
  });

  it('reports every environment problem at once', () => {
    let issues: string[] = [];
    try {
      loadConfiguration({ PORT: 'eighty', LOG_LEVEL: 'loud' });
    } catch (error) {
      issues = (error as EnvValidationError).issues.map((issue) => issue.key).sort();
    }

    expect(issues).toEqual(['DATABASE_URL', 'LOG_LEVEL', 'PORT']);
  });

  it('requires issuer and audience in oidc mode', () => {
    expect(() => loadConfiguration({ ...base, AUTH_MODE: 'oidc' })).toThrow(ConfigurationError);
    expect(() =>
      loadConfiguration({ ...base, AUTH_MODE: 'oidc', OIDC_ISSUER_URL: 'https://login.example' }),
    ).toThrow(/OIDC_AUDIENCE/);
  });

  it('loads oidc configuration when complete', () => {
    const config = loadConfiguration({
      ...base,
      AUTH_MODE: 'oidc',
      OIDC_ISSUER_URL: 'https://login.example/tenant/v2.0',
      OIDC_AUDIENCE: 'api://tania',
      OIDC_SCOPE_CLAIM: 'scp',
      CORS_ORIGINS: 'https://portal.example, https://admin.example',
    });

    expect(config.auth.mode).toBe('oidc');
    expect(config.auth.oidc?.audience).toBe('api://tania');
    expect(config.auth.oidc?.scopeClaim).toBe('scp');
    expect(config.corsOrigins).toEqual(['https://portal.example', 'https://admin.example']);
  });

  it('honours governance overrides', () => {
    const config = loadConfiguration({
      ...base,
      APPROVAL_THRESHOLD: 'MEDIUM',
      APPROVAL_REQUIRE_SEPARATE_APPROVER: 'true',
    });

    expect(config.governance.approvalThreshold).toBe('MEDIUM');
    expect(config.governance.requireSeparateApprover).toBe(true);
  });

  it('never exposes secrets when describing configuration', () => {
    const described = describeConfiguration({ ...base, TANIA_SERVICE_TOKEN: 'super-secret' });

    expect(described.DATABASE_URL).toBe('«redacted»');
    expect(described.TANIA_SERVICE_TOKEN).toBe('«redacted»');
    expect(JSON.stringify(described)).not.toContain('super-secret');
  });
});
