import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { RecordTurnDto } from './dto/record-turn.dto.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CurrentRequestId } from '../common/request-id.decorator.js';
import type { ActorContext } from '../auth/actor.types.js';

@Controller('v1/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async create(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return { data: await this.sessionsService.create(actor, dto), requestId };
  }

  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const data = await this.sessionsService.list(actor, Math.min(Math.max(limit, 1), 100));
    return { data, requestId, meta: { page: { limit, returned: data.length } } };
  }

  @Get(':id')
  async get(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
  ) {
    return { data: await this.sessionsService.getWithMessages(actor, id), requestId };
  }

  @Post(':id/turns')
  async recordTurn(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
    @Body() dto: RecordTurnDto,
  ) {
    return { data: await this.sessionsService.recordTurn(actor, id, dto), requestId };
  }
}
