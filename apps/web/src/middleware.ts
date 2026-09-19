import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers for every response.
 *
 * Set in middleware rather than in `next.config` so the nonce can change per
 * request: a CSP with `unsafe-inline` is a CSP in name only, and Next injects
 * inline bootstrap scripts that need one.
 *
 * `'strict-dynamic'` lets those nonced scripts load the chunks they need
 * without listing every hashed filename, which would otherwise make the policy
 * unmaintainable across builds.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    // `unsafe-eval` only in development: the dev server compiles in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${development ? "'unsafe-eval'" : ''}`,
    // Tailwind injects styles at runtime; there is no nonce path for them.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // The avatar loads models and the voice layer plays audio blobs.
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });

  const reportOnly = process.env.TANIA_CSP_REPORT_ONLY === 'true';
  response.headers.set(
    reportOnly ? 'content-security-policy-report-only' : 'content-security-policy',
    csp,
  );

  // Clickjacking, MIME sniffing, and referrer leakage.
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');

  // The portal needs none of these; denying them shrinks what a compromised
  // script could reach. The microphone is allowed because voice needs it.
  response.headers.set(
    'permissions-policy',
    'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
  );

  // Only meaningful over HTTPS, and only set there: sending it over plain HTTP
  // in development would pin localhost to HTTPS in the developer's browser.
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set(
      'strict-transport-security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  return response;
}

export const config = {
  /**
   * Everything except static assets.
   *
   * Next's own immutable build output does not need a per-request policy, and
   * excluding it keeps the middleware off the hot path.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
