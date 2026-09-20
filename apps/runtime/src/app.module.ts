import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { CommandsController } from './commands/commands.controller.js';
import { CommandsService } from './commands/commands.service.js';
import { HealthController } from './health/health.controller.js';

/**
 * Validation is declared here, not in `main.ts`.
 *
 * A pipe installed during bootstrap protects only what bootstrap starts. Tests
 * build the app straight from this module, so a rule that lived in the entry
 * point would be absent from every test — the suite would pass while asserting
 * a laxer contract than the one that ships, which is the worst kind of green.
 *
 * `forbidNonWhitelisted` matters beyond tidiness at an execution layer: an
 * unrecognised field means the caller and the runtime disagree about the
 * contract, and guessing which is right is how a command does something nobody
 * asked for.
 */
@Module({
  controllers: [CommandsController, HealthController],
  providers: [
    CommandsService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
