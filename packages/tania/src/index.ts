/**
 * @tania/core — domain ports for the TANIA platform.
 *
 * Interfaces and service boundaries only: no model calls, no I/O, no framework.
 * Implementations live in the applications that own them, and are swapped by
 * configuration rather than by editing the domain.
 *
 * Import a single domain with its subpath, e.g. `@tania/core/governance`.
 */
export * as identity from './identity/index.js';
export * as intent from './intent/index.js';
export * as context from './context/index.js';
export * as reasoning from './reasoning/index.js';
export * as planning from './planning/index.js';
export * as memory from './memory/index.js';
export * as knowledge from './knowledge/index.js';
export * as orchestration from './orchestration/index.js';
export * as governance from './governance/index.js';
export * as verification from './verification/index.js';
export * as runtime from './runtime/index.js';
export * as voice from './voice/index.js';
export * as insight from './insight/index.js';
