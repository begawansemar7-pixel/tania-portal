import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { createLogger, type LogFields, type Logger } from '@tania/config';
import { CONFIG, type AppConfig } from '../config/configuration.js';

/**
 * Nest's logger contract, backed by the shared structured logger so API,
 * portal, and runtime all emit the same JSON shape.
 */
@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly logger: Logger;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.logger = createLogger({
      service: config.service,
      level: config.logLevel,
      environment: config.environment,
      version: config.version,
    });
  }

  private static fields(context?: unknown, extra: LogFields = {}): LogFields {
    return typeof context === 'string' ? { context, ...extra } : extra;
  }

  private static text(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }

  log(message: unknown, context?: unknown): void {
    this.logger.info(StructuredLogger.text(message), StructuredLogger.fields(context));
  }

  error(message: unknown, stack?: unknown, context?: unknown): void {
    this.logger.error(
      StructuredLogger.text(message),
      StructuredLogger.fields(context, typeof stack === 'string' ? { stack } : {}),
    );
  }

  warn(message: unknown, context?: unknown): void {
    this.logger.warn(StructuredLogger.text(message), StructuredLogger.fields(context));
  }

  debug(message: unknown, context?: unknown): void {
    this.logger.debug(StructuredLogger.text(message), StructuredLogger.fields(context));
  }

  verbose(message: unknown, context?: unknown): void {
    this.logger.debug(StructuredLogger.text(message), StructuredLogger.fields(context));
  }

  /** Non-repudiable record of a meaningful action. */
  audit(event: string, fields: LogFields): void {
    this.logger.audit(event, fields);
  }

  /** Logger bound to a request, so every line carries its correlation id. */
  forRequest(requestId: string): Logger {
    return this.logger.child({ requestId });
  }
}
