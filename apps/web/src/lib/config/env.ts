import {
  EnvValidationError,
  bool,
  int,
  loadEnv,
  oneOf,
  redact,
  str,
  type EnvSource,
  type LoadedEnv,
} from '@tania/config';
import type { ApprovalThreshold, JarvisCapability } from '@tania/types';
import { isJarvisCapability } from '@tania/types';

/**
 * Environment contract for the portal.
 *
 * Validated once at module load: a misconfigured deployment fails immediately
 * with every problem listed, rather than misbehaving at request time.
 */
export const ENV_SCHEMA = {
  NODE_ENV: oneOf(['development', 'test', 'production'] as const, { default: 'development' }),
  TANIA_APP_NAME: str({ default: 'Portal TANIA' }),
  SERVICE_VERSION: str({ default: '0.1.0' }),
  LOG_LEVEL: oneOf(['debug', 'info', 'warn', 'error'] as const, { default: 'info' }),

  TANIA_API_BASE_URL: str(),
  TANIA_SERVICE_TOKEN: str({ secret: true }),
  TANIA_API_TIMEOUT_MS: int({ default: 8000, min: 100, max: 120_000 }),

  TANIA_LLM_PROVIDER: oneOf(['mock', 'external'] as const, { default: 'mock' }),
  TANIA_LLM_MODEL: str({ default: 'tania-mock-v1' }),
  TANIA_LLM_BASE_URL: str(),
  TANIA_LLM_API_KEY: str({ secret: true }),
  /** Delay between mock stream chunks; 0 makes streaming instant for tests. */
  TANIA_LLM_STREAM_DELAY_MS: int({ default: 18, min: 0, max: 1000 }),

  TANIA_RAG_PROVIDER: oneOf(['mock', 'external'] as const, { default: 'mock' }),
  TANIA_RAG_TOP_K: int({ default: 3, min: 1, max: 20 }),
  TANIA_RAG_BASE_URL: str(),
  TANIA_RAG_API_KEY: str({ secret: true }),
  TANIA_RAG_EMBEDDING_MODEL: str({ default: 'tania-hash-embed-v1' }),
  TANIA_RAG_EMBEDDING_DIMENSIONS: int({ default: 128, min: 8, max: 4096 }),
  /** Minimum top score before an answer may assert facts from retrieval. */
  TANIA_RAG_MIN_SCORE: int({ default: 18, min: 0, max: 100 }),

  TANIA_RUNTIME_ADAPTER: oneOf(['mock', 'jarvis'] as const, { default: 'mock' }),
  JARVIS_BASE_URL: str(),
  /**
   * Capabilities the configured JARVIS actually serves, comma-separated.
   *
   * Anything left out stays simulated. Unset means "all of them" — the right
   * default for a runtime that implements the full contract, and one a
   * deployment narrows rather than widens.
   */
  JARVIS_CAPABILITIES: str(),

  /**
   * Where the 3D avatar asset lives (GLB or VRM).
   *
   * Public because the scene fetches it from the browser. Unset means no scene
   * is rendered at all — the 2D presence stands in and says why.
   */
  NEXT_PUBLIC_TANIA_AVATAR_URL: str(),

  /**
   * Origins allowed to make mutating requests, comma-separated.
   *
   * The portal's own origin is derived from the request — `x-forwarded-host`
   * and `x-forwarded-proto` when an ingress sets them, otherwise `host` — so a
   * normal deployment needs nothing here. This is for a *separate* front-end or
   * an embedded surface on another host.
   */
  TANIA_ALLOWED_ORIGINS: str(),
  /** Reports Content-Security-Policy violations instead of enforcing them. */
  TANIA_CSP_REPORT_ONLY: bool({ default: false }),

  TANIA_APPROVAL_THRESHOLD: oneOf(['MEDIUM', 'HIGH', 'CRITICAL'] as const, { default: 'HIGH' }),
  TANIA_AUDIT_ENABLED: bool({ default: true }),

  /**
   * How the portal decides who is asking.
   *
   * `mock` resolves every visitor to one development actor holding every
   * scope — including `workflow:approve`, which would let anyone approve their
   * own high-risk actions. It is refused outright in production; see
   * `loadConfig`.
   */
  TANIA_AUTH_MODE: oneOf(['mock', 'oidc'] as const, { default: 'mock' }),

  TANIA_OIDC_ISSUER: str(),
  TANIA_OIDC_CLIENT_ID: str(),
  TANIA_OIDC_CLIENT_SECRET: str({ secret: true }),
  /** Absolute URL of this portal's callback, registered with the IdP. */
  TANIA_OIDC_REDIRECT_URI: str(),
  TANIA_OIDC_SCOPES: str({ default: 'openid profile email' }),
  /** Claim carrying group or role names, mapped to scopes by the RBAC table. */
  TANIA_OIDC_ROLES_CLAIM: str({ default: 'roles' }),
  TANIA_OIDC_CLEARANCE_CLAIM: str(),
  TANIA_OIDC_UNIT_CLAIM: str(),

  /** Signs the session cookie. At least 32 characters. */
  TANIA_SESSION_SECRET: str({ secret: true }),
  TANIA_SESSION_TTL_SECONDS: int({ default: 28_800, min: 300, max: 86_400 }),
} as const;

export type Env = LoadedEnv<typeof ENV_SCHEMA>;

export type LlmProviderId = Env['TANIA_LLM_PROVIDER'];
export type RetrieverId = Env['TANIA_RAG_PROVIDER'];
export type RuntimeId = Env['TANIA_RUNTIME_ADAPTER'];

export interface TaniaConfig {
  service: string;
  appName: string;
  version: string;
  environment: Env['NODE_ENV'];
  logLevel: Env['LOG_LEVEL'];
  api: {
    /** Backend base URL. When unset the portal falls back to in-memory state. */
    baseUrl?: string;
    serviceToken?: string;
    timeoutMs: number;
  };
  llm: {
    provider: LlmProviderId;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    streamDelayMs: number;
  };
  rag: {
    retriever: RetrieverId;
    topK: number;
    baseUrl?: string;
    apiKey?: string;
    embeddingModel: string;
    embeddingDimensions: number;
    /** Expressed 0–1; configured as a percentage for readability. */
    minScore: number;
  };
  avatar: {
    /** Absent until an asset is configured; the scene is then not rendered. */
    assetUrl?: string;
  };
  runtime: {
    adapter: RuntimeId;
    baseUrl?: string;
    /** Capabilities the runtime serves. Absent means all of them. */
    capabilities?: JarvisCapability[];
  };
  governance: { approvalThreshold: ApprovalThreshold; auditEnabled: boolean };
  auth: AuthConfig;
  security: {
    /** Extra origins permitted to send mutating requests. */
    allowedOrigins: string[];
    cspReportOnly: boolean;
  };
}

export function loadConfig(source: EnvSource = process.env): TaniaConfig {
  const env = loadEnv(ENV_SCHEMA, source);
  const liveCapabilities = parseCapabilities(env.JARVIS_CAPABILITIES);

  return {
    service: 'tania.web',
    appName: env.TANIA_APP_NAME,
    version: env.SERVICE_VERSION,
    environment: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    api: {
      ...(env.TANIA_API_BASE_URL === undefined ? {} : { baseUrl: env.TANIA_API_BASE_URL }),
      ...(env.TANIA_SERVICE_TOKEN === undefined ? {} : { serviceToken: env.TANIA_SERVICE_TOKEN }),
      timeoutMs: env.TANIA_API_TIMEOUT_MS,
    },
    llm: {
      provider: env.TANIA_LLM_PROVIDER,
      model: env.TANIA_LLM_MODEL,
      ...(env.TANIA_LLM_BASE_URL === undefined ? {} : { baseUrl: env.TANIA_LLM_BASE_URL }),
      ...(env.TANIA_LLM_API_KEY === undefined ? {} : { apiKey: env.TANIA_LLM_API_KEY }),
      streamDelayMs: env.TANIA_LLM_STREAM_DELAY_MS,
    },
    rag: {
      retriever: env.TANIA_RAG_PROVIDER,
      topK: env.TANIA_RAG_TOP_K,
      ...(env.TANIA_RAG_BASE_URL === undefined ? {} : { baseUrl: env.TANIA_RAG_BASE_URL }),
      ...(env.TANIA_RAG_API_KEY === undefined ? {} : { apiKey: env.TANIA_RAG_API_KEY }),
      embeddingModel: env.TANIA_RAG_EMBEDDING_MODEL,
      embeddingDimensions: env.TANIA_RAG_EMBEDDING_DIMENSIONS,
      minScore: env.TANIA_RAG_MIN_SCORE / 100,
    },
    avatar: {
      ...(env.NEXT_PUBLIC_TANIA_AVATAR_URL === undefined
        ? {}
        : { assetUrl: env.NEXT_PUBLIC_TANIA_AVATAR_URL }),
    },
    runtime: {
      adapter: env.TANIA_RUNTIME_ADAPTER,
      ...(env.JARVIS_BASE_URL === undefined ? {} : { baseUrl: env.JARVIS_BASE_URL }),
      ...(liveCapabilities === undefined ? {} : { capabilities: liveCapabilities }),
    },
    governance: {
      approvalThreshold: env.TANIA_APPROVAL_THRESHOLD,
      auditEnabled: env.TANIA_AUDIT_ENABLED,
    },
    auth: resolveAuth(env),
    security: {
      allowedOrigins: (env.TANIA_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      cspReportOnly: env.TANIA_CSP_REPORT_ONLY,
    },
  };
}

export interface OidcPortalConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  rolesClaim: string;
  clearanceClaim?: string;
  unitClaim?: string;
}

export interface AuthConfig {
  mode: Env['TANIA_AUTH_MODE'];
  oidc?: OidcPortalConfig;
  session: { secret: string; ttlSeconds: number };
  /**
   * True when this deployment would authenticate nobody in production.
   *
   * Reported rather than thrown, because configuration is evaluated during
   * `next build` too — and the machine that builds an image has no identity
   * provider, nor should it need one. Enforcement therefore happens where the
   * distinction is real: `createIdentityProvider` refuses to resolve anyone,
   * and `/api/ready` reports the instance unfit for traffic.
   */
  insecure: boolean;
}

/** Raised when the environment is internally inconsistent rather than malformed. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** A development-only secret, so `mock` mode needs no configuration at all. */
const DEV_SESSION_SECRET = 'tania-development-session-secret-not-for-production';

/**
 * Resolves authentication, refusing every half-configured combination.
 *
 * Two rules, both fail-closed, because the alternative in each case is a portal
 * that looks like it is protecting something and is not:
 *
 * 1. **`mock` in production is marked `insecure`.** It resolves every visitor
 *    to one actor holding every scope, `workflow:approve` included — so the
 *    approval gate, the whole point of the governance layer, becomes
 *    self-service. It is flagged here and refused at the point of use rather
 *    than thrown here, because this same code runs during `next build`, where
 *    no identity provider exists and none is needed.
 * 2. **`oidc` must be described completely.** A missing client secret would
 *    otherwise surface as a failed code exchange on someone's first login,
 *    long after the deploy that caused it. This one *is* thrown: it can only
 *    be reached by a deployment that asked for OIDC, so it cannot fire on a
 *    build machine.
 */
export function resolveAuth(env: Env): AuthConfig {
  const production = env.NODE_ENV === 'production';

  if (env.TANIA_AUTH_MODE === 'mock') {
    return {
      mode: 'mock',
      insecure: production,
      session: {
        secret: env.TANIA_SESSION_SECRET ?? DEV_SESSION_SECRET,
        ttlSeconds: env.TANIA_SESSION_TTL_SECONDS,
      },
    };
  }

  const required = {
    TANIA_OIDC_ISSUER: env.TANIA_OIDC_ISSUER,
    TANIA_OIDC_CLIENT_ID: env.TANIA_OIDC_CLIENT_ID,
    TANIA_OIDC_CLIENT_SECRET: env.TANIA_OIDC_CLIENT_SECRET,
    TANIA_OIDC_REDIRECT_URI: env.TANIA_OIDC_REDIRECT_URI,
    TANIA_SESSION_SECRET: env.TANIA_SESSION_SECRET,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.length === 0)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new ConfigurationError(`TANIA_AUTH_MODE=oidc requires ${missing.join(', ')}.`);
  }

  // A short secret is a long-lived forgery risk: the cookie it signs is the
  // only thing standing between a visitor and someone else's session.
  if ((required.TANIA_SESSION_SECRET as string).length < 32) {
    throw new ConfigurationError('TANIA_SESSION_SECRET must be at least 32 characters.');
  }

  return {
    mode: 'oidc',
    insecure: false,
    oidc: {
      issuer: required.TANIA_OIDC_ISSUER as string,
      clientId: required.TANIA_OIDC_CLIENT_ID as string,
      clientSecret: required.TANIA_OIDC_CLIENT_SECRET as string,
      redirectUri: required.TANIA_OIDC_REDIRECT_URI as string,
      scopes: env.TANIA_OIDC_SCOPES,
      rolesClaim: env.TANIA_OIDC_ROLES_CLAIM,
      ...(env.TANIA_OIDC_CLEARANCE_CLAIM === undefined
        ? {}
        : { clearanceClaim: env.TANIA_OIDC_CLEARANCE_CLAIM }),
      ...(env.TANIA_OIDC_UNIT_CLAIM === undefined ? {} : { unitClaim: env.TANIA_OIDC_UNIT_CLAIM }),
    },
    session: {
      secret: required.TANIA_SESSION_SECRET as string,
      ttlSeconds: env.TANIA_SESSION_TTL_SECONDS,
    },
  };
}

/**
 * Reads the declared capability list.
 *
 * An unknown name is a configuration mistake, not something to route around:
 * silently dropping it would leave an operator believing a capability is live.
 */
function parseCapabilities(raw: string | undefined): JarvisCapability[] | undefined {
  if (raw === undefined) return undefined;

  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const unknown = names.filter((name) => !isJarvisCapability(name));
  if (unknown.length > 0) {
    throw new EnvValidationError([
      {
        key: 'JARVIS_CAPABILITIES',
        message: `unknown capabilities: ${unknown.join(', ')}`,
      },
    ]);
  }

  return names.filter(isJarvisCapability);
}

/** Configuration with secrets masked — safe for the Settings page and logs. */
export function describeConfig(source: EnvSource = process.env): Record<string, unknown> {
  return redact(ENV_SCHEMA, loadEnv(ENV_SCHEMA, source));
}

export const config: TaniaConfig = loadConfig();
