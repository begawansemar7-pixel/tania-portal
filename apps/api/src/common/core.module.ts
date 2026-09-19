import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CONFIG, loadConfiguration } from '../config/configuration.js';
import { StructuredLogger } from './logger.service.js';

/**
 * Cross-cutting singletons: validated configuration and structured logging.
 *
 * `ConfigModule.forRoot` only loads a local `.env` into `process.env`; the
 * typed, validated view of that environment is `loadConfiguration()`.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true })],
  providers: [{ provide: CONFIG, useFactory: () => loadConfiguration() }, StructuredLogger],
  exports: [CONFIG, StructuredLogger],
})
export class CoreModule {}
