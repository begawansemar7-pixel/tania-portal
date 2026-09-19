import { config } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/identity/types';

export class TaniaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaniaApiError';
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

export interface TaniaApiClientOptions {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs: number;
}

/**
 * Server-side client for the TANIA backend.
 *
 * The portal is a confidential first-party caller: it proves itself with a
 * service token and asserts which end user it acts for. When the portal can
 * forward a real OIDC access token, send that as the bearer instead and switch
 * the backend to AUTH_MODE=oidc — no other change is required.
 */
export class TaniaApiClient {
  constructor(private readonly options: TaniaApiClientOptions) {}

  private headers(actor: Actor): HeadersInit {
    const assertion = Buffer.from(
      JSON.stringify({
        subject: actor.subject,
        name: actor.name,
        email: actor.email,
        unit: actor.unit,
        role: actor.role,
        clearance: actor.clearance,
        scopes: actor.scopes,
      }),
      'utf8',
    ).toString('base64url');

    return {
      'Content-Type': 'application/json',
      'x-tania-actor': assertion,
      ...(this.options.serviceToken
        ? { Authorization: `Bearer ${this.options.serviceToken}` }
        : {}),
    };
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    actor: Actor,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), ensureTrailingSlash(this.options.baseUrl));

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.headers(actor),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
        cache: 'no-store',
      });
    } catch (cause) {
      logger.error('api.unreachable', {
        path,
        message: cause instanceof Error ? cause.message : String(cause),
      });
      throw new TaniaApiError(503, 'UPSTREAM_UNAVAILABLE', 'TANIA backend is unreachable.');
    }

    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

    if (!response.ok) {
      throw new TaniaApiError(
        response.status,
        payload.error?.code ?? 'UPSTREAM_ERROR',
        payload.error?.message ?? `Backend responded with ${response.status}.`,
      );
    }

    return payload.data as T;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function createApiClient(): TaniaApiClient | undefined {
  if (!config.api.baseUrl) return undefined;

  return new TaniaApiClient({
    baseUrl: config.api.baseUrl,
    serviceToken: config.api.serviceToken,
    timeoutMs: config.api.timeoutMs,
  });
}
