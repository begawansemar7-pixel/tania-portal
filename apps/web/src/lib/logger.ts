import { createLogger } from '@tania/config';
import { config } from '@/lib/config/env';

/**
 * Structured logging for the portal's server side.
 *
 * Same JSON shape as the API and the runtime, so one correlation id can be
 * followed across all three.
 */
export const logger = createLogger({
  service: config.service,
  level: config.logLevel,
  environment: config.environment,
  version: config.version,
});

export type { LogFields, Logger } from '@tania/config';
