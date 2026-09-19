import { Controller, Get, Inject } from '@nestjs/common';
import { buildHealthReport, type HealthProbe } from '@tania/config';
import type { ApiSuccess, HealthReport } from '@tania/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../auth/public.decorator.js';
import { CONFIG, type AppConfig } from '../config/configuration.js';
import { CurrentRequestId } from '../common/request-id.decorator.js';

const STARTED_AT = new Date();

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Liveness and dependency readiness. Public: probes must not need a token. */
  @Public()
  @Get()
  async check(@CurrentRequestId() requestId: string): Promise<ApiSuccess<HealthReport>> {
    const database: HealthProbe = {
      name: 'database',
      timeoutMs: 2000,
      check: async () =>
        (await this.prisma.ping())
          ? { state: 'ok' as const }
          : { state: 'down' as const, detail: 'connection check failed' },
    };

    const report = await buildHealthReport({
      service: this.config.service,
      version: this.config.version,
      environment: this.config.environment,
      startedAt: STARTED_AT,
      probes: [database],
    });

    return { data: report, requestId, meta: { authMode: this.config.auth.mode } };
  }
}
