/**
 * Keeps a post-login redirect inside this site.
 *
 * `returnTo` arrives from a query string, so an absolute URL would turn the
 * login endpoint into an open redirect: a link to our own domain that lands on
 * someone else's, with our sign-in in the middle lending it credibility.
 * Only a single-slash absolute path survives — `//evil.test` is protocol
 * relative and would leave the site.
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  return value;
}
