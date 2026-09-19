import { Module } from '@nestjs/common';
import { CommandsController } from './commands/commands.controller.js';
import { CommandsService } from './commands/commands.service.js';
import { HealthController } from './health/health.controller.js';

@Module({
  controllers: [CommandsController, HealthController],
  providers: [CommandsService],
})
export class AppModule {}
