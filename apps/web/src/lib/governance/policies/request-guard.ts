import { config } from '@/lib/config/env';
import { TaniaError } from '@tania/config';
import { RATE_LIMITS, rateLimiter, type RateLimitDecision } from './rate-limit';

/**
 * Methods that change something and therefore need origin checking.
 *
 * `GET` and `HEAD` are excluded because a cross-site read of a JSON endpoint
 * is blocked by CORS anyway, and because adding a token requirement to reads
 * would break ordinary navigation for no benefit.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface GuardOptions {
  /** Which rate limit applies. */
  bucket: keyof typeof RATE_LIMITS;
  /** Identifies the caller. The actor id when known, otherwise the address. */
  subject: string;
}

export interface GuardResult {
  rateLimit: RateLimitDecision;
}

/**
 * The checks every mutating route runs before doing anything.
 *
 * Two of them, in this order:
 *
 * 1. **Origin.** A browser attaches cookies to a cross-site form post, so a
 *    same-origin check is what stops another site from acting as the user.
 *    This is the CSRF defence for a cookie session; a bearer-token client is
 *    not vulnerable and sends no `Origin` a browser would forge.
 * 2. **Rate limit.** Applied after origin so an attacker cannot exhaust a
 *    legitimate user's budget with forged requests.
 */
export async function guardRequest(
  request: Request,
  options: GuardOptions,
): Promise<GuardResult> {
  if (MUTATING.has(request.method)) assertSameOrigin(request);

  const rule = RATE_LIMITS[options.bucket] ?? RATE_LIMITS['tania.read'];
  const decision = await rateLimiter().check(`${options.bucket}:${options.subject}`, rule!);

  if (!decision.allowed) {
    // `retryAfter` travels on the error so the response can carry the header:
    // a 429 without it tells a client to guess, and clients guess badly.
    throw new TaniaError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.', {
      status: 429,
      details: { retryAfter: decision.retryAfter, limit: decision.limit },
    });
  }

  return { rateLimit: decision };
}

/**
 * Rejects a mutating request that did not come from this site.
 *
 * A request with neither `Origin` nor `Referer` is allowed through: that is
 * what a server-to-server client looks like, and such a client authenticates
 * with a bearer token rather than an ambient cookie, so it is not the thing
 * CSRF protects against. A browser always sends one of the two.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const stated = origin ?? (referer ? safeOrigin(referer) : undefined);

  if (stated === undefined) return;

  const allowed = new Set<string>([...siteOrigins(request), ...config.security.allowedOrigins]);

  if (!allowed.has(stated)) {
    throw new TaniaError('FORBIDDEN', 'Permintaan lintas situs ditolak.', { status: 403 });
  }
}

/**
 * The origins that count as "this site".
 *
 * `new URL(request.url).origin` alone is wrong everywhere the portal actually
 * runs. Next resolves that from the address the server is bound to, so a
 * container listening on `0.0.0.0:3000` behind an ingress computes
 * `http://0.0.0.0:3000` while the browser sends the public origin — and every
 * mutating request from every real user is rejected as cross-site. The bug
 * hides in development because dev and public origin happen to coincide.
 *
 * So the host is taken from what the request was addressed to, which is what
 * OWASP recommends for this check: the browser sets both `Origin` and `Host`,
 * and a page on another site cannot forge `Origin`. `x-forwarded-*` is trusted
 * because it comes from our own ingress — which must strip any client-supplied
 * copy, as ingresses are configured to do by default.
 *
 * `request.url`'s origin is kept as the last entry so a direct, unproxied
 * deployment keeps working.
 */
function siteOrigins(request: Request): string[] {
  const header = (name: string): string | undefined => {
    // A proxy chain sends a comma-separated list; the first entry is the client-facing one.
    const raw = request.headers.get(name)?.split(',')[0]?.trim();
    return raw === undefined || raw.length === 0 ? undefined : raw;
  };

  const requestOrigin = safeOrigin(request.url);
  const host = header('x-forwarded-host') ?? header('host');
  const proto = header('x-forwarded-proto');

  const origins: string[] = [];

  if (host !== undefined) {
    /**
     * Both schemes when the proxy did not say which.
     *
     * The internal protocol is no guide: an ingress terminating TLS serves
     * `https` to the browser and forwards plain `http`, so deriving the scheme
     * from `request.url` would reject every real user. Accepting both is not a
     * weakening — the host still has to match, and an attacker who controls
     * that host does not need a scheme confusion to abuse it.
     */
    for (const scheme of proto === undefined ? ['https', 'http'] : [proto]) {
      const candidate = safeOrigin(`${scheme}://${host}`);
      if (candidate !== undefined) origins.push(candidate);
    }
  }

  if (requestOrigin !== undefined) origins.push(requestOrigin);

  return origins;
}

function safeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** Headers describing the caller's remaining budget. */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(decision.remaining),
    ...(decision.retryAfter > 0 ? { 'retry-after': String(decision.retryAfter) } : {}),
  };
}
