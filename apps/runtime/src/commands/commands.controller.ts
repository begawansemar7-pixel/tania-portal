import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { JarvisCommand, JarvisResult } from '@tania/types';
import { CommandsService } from './commands.service.js';
import { ServiceTokenGuard } from '../auth/service-token.guard.js';
import { TOOL_MANIFEST } from '../manifest/tool-manifest.js';
import { ExecuteCommandDto } from './dto/execute-command.dto.js';

/**
 * The whole surface TANIA talks to.
 *
 * `POST /v1/commands` is the contract in `@tania/types`: a `JarvisCommand` in,
 * a `JarvisResult` out. The result is returned bare — the portal's adapter
 * accepts it either bare or wrapped, and bare is what the contract describes.
 */
@Controller('v1')
@UseGuards(ServiceTokenGuard)
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Post('commands')
  async execute(@Body() command: ExecuteCommandDto): Promise<JarvisResult> {
    return this.commands.execute(command as JarvisCommand);
  }

  /**
   * What this runtime publishes.
   *
   * The single tool manifest: the runtime declares `effect`, `reversible` and
   * `defaultRisk`, because only the side that performs the work can state them
   * honestly. The governance plane may raise a risk, never lower it.
   */
  @Get('manifest')
  manifest() {
    return {
      tools: TOOL_MANIFEST,
      capabilities: this.commands.describe(),
    };
  }
}
