import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CurrentRequestId } from '../common/request-id.decorator.js';
import type { ActorContext } from '../auth/actor.types.js';

@Controller('v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @CurrentRequestId() requestId: string,
    @Query('sessionId') sessionId?: string,
    @Query('approvalId') approvalId?: string,
    @Query('event') event?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const data = await this.auditService.list(actor, {
      sessionId,
      approvalId,
      event,
      limit: Math.min(Math.max(limit, 1), 200),
    });
    return { data, requestId, meta: { page: { limit, returned: data.length } } };
  }

  @Get('verify')
  async verify(@CurrentRequestId() requestId: string) {
    return { data: await this.auditService.verify(), requestId };
  }
}
