/**
 * State that must be the same object everywhere in the process.
 *
 * Next bundles pages and route handlers separately, so a module-level
 * singleton is instantiated **once per bundle**: a task created by
 * `/api/tania/tasks` would otherwise be invisible to the `/my-work` page, even
 * though both run in the same Node process. Hot reload duplicates modules for
 * the same reason.
 *
 * Anchoring to `globalThis` is the standard way out, and it is only needed for
 * state that lives in memory. Anything durable — approvals, transcripts — is
 * already shared through PostgreSQL and does not belong here.
 */
const REGISTRY = Symbol.for('tania.process-state');

type Registry = Map<string, unknown>;

function registry(): Registry {
  const host = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
  host[REGISTRY] ??= new Map<string, unknown>();
  return host[REGISTRY];
}

/**
 * Returns the one instance for `key`, creating it on first use.
 *
 * The key is explicit rather than derived from the factory, because two
 * bundles hold two different factory functions for the same logical store —
 * which is exactly the problem being solved.
 */
export function processSingleton<T>(key: string, create: () => T): T {
  const store = registry();
  if (!store.has(key)) store.set(key, create());
  return store.get(key) as T;
}

/** Clears one entry. Used by tests; never in application code. */
export function resetProcessSingleton(key: string): void {
  registry().delete(key);
}
