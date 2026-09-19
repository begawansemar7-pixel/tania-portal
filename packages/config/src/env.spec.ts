import { describe, expect, it } from 'vitest';
import { EnvValidationError, bool, csv, int, loadEnv, oneOf, redact, str, url } from './env.js';

const schema = {
  SERVICE_NAME: str({ default: 'tania' }),
  PORT: int({ default: 4000, min: 1, max: 65535 }),
  DATABASE_URL: str({ required: true, secret: true }),
  AUTH_MODE: oneOf(['service', 'oidc'] as const, { default: 'service' }),
  AUDIT_ENABLED: bool({ default: true }),
  CORS_ORIGINS: csv({ default: ['http://localhost:3000'] }),
  BASE_URL: url({ protocols: ['http:', 'https:'] }),
};

const valid = { DATABASE_URL: 'postgresql://user:pw@localhost:5432/db' } as NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('applies defaults and types every value', () => {
    const config = loadEnv(schema, valid);

    expect(config.SERVICE_NAME).toBe('tania');
    expect(config.PORT).toBe(4000);
    expect(config.AUTH_MODE).toBe('service');
    expect(config.AUDIT_ENABLED).toBe(true);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(config.BASE_URL).toBeUndefined();
  });

  it('reports every problem at once, not just the first', () => {
    let caught: EnvValidationError | undefined;
    try {
      loadEnv(schema, { PORT: 'eighty', AUTH_MODE: 'kerberos', BASE_URL: 'not-a-url' });
    } catch (error) {
      caught = error as EnvValidationError;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect(caught?.issues.map((issue) => issue.key).sort()).toEqual([
      'AUTH_MODE',
      'BASE_URL',
      'DATABASE_URL',
      'PORT',
    ]);
    expect(caught?.message).toContain('is required but was not set');
  });

  it('treats an empty string as unset', () => {
    const config = loadEnv(schema, { ...valid, SERVICE_NAME: '   ' });
    expect(config.SERVICE_NAME).toBe('tania');
  });

  it('enforces numeric bounds and integer form', () => {
    expect(() => loadEnv(schema, { ...valid, PORT: '0' })).toThrow(/must be >= 1/);
    expect(() => loadEnv(schema, { ...valid, PORT: '3000.5' })).toThrow(/must be an integer/);
  });

  it('parses booleans and csv lists', () => {
    const config = loadEnv(schema, {
      ...valid,
      AUDIT_ENABLED: 'off',
      CORS_ORIGINS: 'https://a.example, https://b.example ,',
    });

    expect(config.AUDIT_ENABLED).toBe(false);
    expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rejects an unsupported URL protocol', () => {
    expect(() => loadEnv(schema, { ...valid, BASE_URL: 'ftp://example.com' })).toThrow(
      /must use one of/,
    );
  });

  it('redacts values marked secret', () => {
    const config = loadEnv(schema, valid);
    const safe = redact(schema, config);

    expect(safe.DATABASE_URL).toBe('«redacted»');
    expect(safe.SERVICE_NAME).toBe('tania');
  });
});
