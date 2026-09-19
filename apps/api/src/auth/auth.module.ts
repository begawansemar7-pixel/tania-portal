import { Global, Module } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config/configuration.js';
import { StructuredLogger } from '../common/logger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { OidcTokenVerifier } from './oidc-token.verifier.js';
import { ServiceTokenVerifier } from './service-token.verifier.js';
import { TOKEN_VERIFIER, type TokenVerifier } from './token-verifier.js';

@Global()
@Module({
  providers: [
    {
      provide: TOKEN_VERIFIER,
      inject: [CONFIG, StructuredLogger],
      useFactory: (config: AppConfig, logger: StructuredLogger): TokenVerifier =>
        config.auth.mode === 'oidc'
          ? new OidcTokenVerifier(config)
          : new ServiceTokenVerifier(config, logger),
    },
    {
      provide: AuthService,
      inject: [TOKEN_VERIFIER, PrismaService],
      useFactory: (verifier: TokenVerifier, prisma: PrismaService) =>
        new AuthService(verifier, prisma),
    },
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard, TOKEN_VERIFIER],
})
export class AuthModule {}
