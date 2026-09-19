/**
 * @tania/config — platform runtime primitives shared by every TANIA service.
 *
 * Process-level concerns only: validated configuration, structured logging,
 * structured errors, request correlation, and health reporting. Domain
 * behaviour belongs in `@tania/core`; wire shapes in `@tania/types`.
 */
export * from './env.js';
export * from './errors.js';
export * from './logger.js';
export * from './correlation.js';
export * from './health.js';
