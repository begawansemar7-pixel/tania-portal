import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './common/core.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuditModule } from './audit/audit.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { HealthModule } from './health/health.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    AuthModule,
    AuditModule,
    SessionsModule,
    ApprovalsModule,
    WorkspaceModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
