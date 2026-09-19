import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service.js';
import { SaveTaskDto } from './dto/save-task.dto.js';
import { RememberDto } from './dto/remember.dto.js';
import { RecordGovernanceDto } from './dto/record-governance.dto.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CurrentRequestId } from '../common/request-id.decorator.js';
import type { ActorContext } from '../auth/actor.types.js';

function bounded(limit: number, max = 200): number {
  return Math.min(Math.max(limit, 1), max);
}

@Controller('v1/tasks')
export class TasksController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Post()
  async save(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Body() dto: SaveTaskDto,
  ) {
    return { data: await this.workspace.saveTask(actor, dto), requestId };
  }

  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('approvalId') approvalId?: string,
  ) {
    // One endpoint, two questions: the recent list, or the single task a
    // decided approval belongs to.
    if (approvalId) {
      const task = await this.workspace.findTaskByApproval(actor, approvalId);
      return { data: task ? [task] : [], requestId };
    }

    const data = await this.workspace.listTasks(actor, bounded(limit));
    return { data, requestId, meta: { page: { limit, returned: data.length } } };
  }

  @Get(':id')
  async get(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
  ) {
    const task = await this.workspace.getTask(actor, id);
    // Indistinguishable from another actor's task on purpose: a 403 here would
    // confirm that the id exists.
    if (!task) throw new NotFoundException(`Task ${id} was not found.`);
    return { data: task, requestId };
  }
}

@Controller('v1/memory')
export class MemoryController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Post()
  async remember(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Body() dto: RememberDto,
  ) {
    return { data: await this.workspace.remember(actor, dto), requestId };
  }

  @Get()
  async recall(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('scope') scope?: string,
    @Query('sessionId') sessionId?: string,
    @Query('query') query?: string,
  ) {
    const data = await this.workspace.recall(actor, {
      limit: bounded(limit, 100),
      ...(scope ? { scope } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(query ? { query } : {}),
    });

    return { data, requestId, meta: { page: { limit, returned: data.length } } };
  }

  @Delete(':id')
  async forget(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Param('id') id: string,
  ) {
    const forgotten = await this.workspace.forget(actor, id);
    if (!forgotten) throw new NotFoundException(`Memory ${id} was not found.`);
    return { data: { forgotten: true }, requestId };
  }
}

@Controller('v1/governance')
export class GovernanceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Post()
  async record(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Body() dto: RecordGovernanceDto,
  ) {
    return { data: await this.workspace.recordGovernance(actor, dto), requestId };
  }

  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const data = await this.workspace.listGovernance(actor, bounded(limit));
    return { data, requestId, meta: { page: { limit, returned: data.length } } };
  }
}
