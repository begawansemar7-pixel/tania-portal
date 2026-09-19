import { Controller, Get } from '@nestjs/common';

/** Liveness, deliberately unauthenticated so an orchestrator can poll it. */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  health() {
    return {
      service: 'tania.runtime',
      state: 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }
}
