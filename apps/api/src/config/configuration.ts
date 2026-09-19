import { loadEnv, oneOf, int, str, bool, csv, redact, type LoadedEnv, type EnvSource } from '@tania/config';
import type { ApprovalThreshold } from '@tania/types';

/**
 * Environment contract for the API.
 *
 * Declared once, validated as a whole at startup, and reported in full when
 * wrong. Nothing here is hardcoded to a production host, and secrets are
 * marked so configuration can be logged safely.
 */
export const ENV_SCHEMA = {
  NODE_ENV: oneOf(['development', 'test', 'production'] as const, { default: 'development' }),
  SERVICE_VERSION: str({ default: '0.1.0' }),
  PORT: int({ default: 4000, min: 1, max: 65535 }),
  LOG_LEVEL: oneOf(['debug', 'info', 'warn', 'error'] as const, { default: 'info' }),

  DATABASE_URL: str({ required: true, secret: true }),
  CORS_ORIGINS: csv({ default: ['http://localhost:3000'] }),

  AUTH_MODE: oneOf(['service', 'oidc'] as const, { default: 'service' }),
  TANIA_SERVICE_TOKEN: str({ secret: true }),
  TANIA_ASSERTION_ISSUER: str({ default: 'urn:tania:portal' }),

  OIDC_ISSUER_URL: str(),
  OIDC_AUDIENCE: str(),
  OIDC_JWKS_URI: str(),
  OIDC_SCOPE_CLAIM: str({ default: 'roles' }),
  OIDC_CLEARANCE_CLAIM: str(),
  OIDC_UNIT_CLAIM: str(),

  APPROVAL_THRESHOLD: oneOf(['MEDIUM', 'HIGH', 'CRITICAL'] as const, { default: 'HIGH' }),
  APPROVAL_REQUIRE_SEPARATE_APPROVER: bool({ default: false }),
} as const;

export type Env = LoadedEnv<typeof ENV_SCHEMA>;

export type AuthMode = Env['AUTH_MODE'];

export interface OidcConfig {
  issuerUrl: string;
  audience: string;
  jwksUri?: string;
  scopeClaim: string;
  clearanceClaim?: string;
  unitClaim?: string;
}

export interface AppConfig {
  service: string;
  version: string;
  environment: Env['NODE_ENV'];
  logLevel: Env['LOG_LEVEL'];
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  auth: {
    mode: AuthMode;
    serviceToken?: string;
    assertionIssuer: string;
    oidc?: OidcConfig;
  };
  governance: {
    approvalThreshold: ApprovalThreshold;
    requireSeparateApprover: boolean;
  };
}

/** Thrown when the environment cannot produce a usable configuration. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function loadConfiguration(source: EnvSource = process.env): AppConfig {
  const env = loadEnv(ENV_SCHEMA, source);

  // Cross-field rule: OIDC mode is only usable when the issuer is fully described.
  let oidc: OidcConfig | undefined;
  if (env.AUTH_MODE === 'oidc') {
    const missing = [
      env.OIDC_ISSUER_URL ? undefined : 'OIDC_ISSUER_URL',
      env.OIDC_AUDIENCE ? undefined : 'OIDC_AUDIENCE',
    ].filter((key): key is string => key !== undefined);

    if (missing.length > 0) {
      throw new ConfigurationError(
        `AUTH_MODE=oidc requires ${missing.join(' and ')} to be set.`,
      );
    }

    oidc = {
      issuerUrl: env.OIDC_ISSUER_URL as string,
      audience: env.OIDC_AUDIENCE as string,
      scopeClaim: env.OIDC_SCOPE_CLAIM,
      ...(env.OIDC_JWKS_URI === undefined ? {} : { jwksUri: env.OIDC_JWKS_URI }),
      ...(env.OIDC_CLEARANCE_CLAIM === undefined ? {} : { clearanceClaim: env.OIDC_CLEARANCE_CLAIM }),
      ...(env.OIDC_UNIT_CLAIM === undefined ? {} : { unitClaim: env.OIDC_UNIT_CLAIM }),
    };
  }

  return {
    service: 'tania.api',
    version: env.SERVICE_VERSION,
    environment: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: env.CORS_ORIGINS,
    auth: {
      mode: env.AUTH_MODE,
      ...(env.TANIA_SERVICE_TOKEN === undefined ? {} : { serviceToken: env.TANIA_SERVICE_TOKEN }),
      assertionIssuer: env.TANIA_ASSERTION_ISSUER,
      ...(oidc === undefined ? {} : { oidc }),
    },
    governance: {
      approvalThreshold: env.APPROVAL_THRESHOLD,
      requireSeparateApprover: env.APPROVAL_REQUIRE_SEPARATE_APPROVER,
    },
  };
}

/** Configuration with secrets masked — safe for logs and the settings page. */
export function describeConfiguration(source: EnvSource = process.env): Record<string, unknown> {
  return redact(ENV_SCHEMA, loadEnv(ENV_SCHEMA, source));
}

export const CONFIG = Symbol('TANIA_APP_CONFIG');
