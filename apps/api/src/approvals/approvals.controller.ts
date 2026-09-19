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
import { ApprovalsService } from './approvals.service.js';
import { CreateApprovalDto } from './dto/create-approval.dto.js';
import { DecideApprovalDto, RecordExecutionDto } from './dto/decide-approval.dto.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CurrentRequestId } from '../common/request-id.decorator.js';
import type { ActorContext } from '../auth/actor.types.js';
import type { ApprovalStatus } from '../generated/prisma/enums.js';

@Controller('v1/approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  async create(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Body() dto: CreateApprovalDto,
  ) {
    return { data: await this.approvalsService.create(actor, dto), requestId };
  }

  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Query('status') status?: ApprovalStatus,
    @Query('sessionId') sessionId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const data = await this.approvalsService.list(actor, {
      status,
      sessionId,
      limit: Math.min(Math.max(limit, 1), 200),
    });
    return { data, requestId, meta: { page: { limit, returned: data.length } } };
  }

  @Get(':id')
  async get(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
  ) {
    return { data: await this.approvalsService.get(actor, id), requestId };
  }

  @Post(':id/decision')
  async decide(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return { data: await this.approvalsService.decide(actor, id, dto), requestId };
  }

  @Post(':id/execution')
  async recordExecution(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
    @Body() dto: RecordExecutionDto,
  ) {
    return { data: await this.approvalsService.recordExecution(actor, id, dto), requestId };
  }
}
