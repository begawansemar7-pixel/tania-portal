import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { TOKEN_VERIFIER, type TokenVerifier } from './token-verifier.js';
import type { ActorContext } from './actor.types.js';

/**
 * Resolves the caller into a persisted Actor projection.
 * Credentials are never stored — only the claims needed for authorisation and audit.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    private readonly prisma: PrismaService,
  ) {}

  async resolveActor(request: Request): Promise<ActorContext> {
    const identity = await this.verifier.verify(request);

    const actor = await this.prisma.actor.upsert({
      where: { issuer_subject: { issuer: identity.issuer, subject: identity.subject } },
      create: {
        subject: identity.subject,
        issuer: identity.issuer,
        name: identity.name,
        email: identity.email,
        unit: identity.unit,
        role: identity.role,
        clearance: identity.clearance,
        scopes: identity.scopes,
      },
      update: {
        name: identity.name,
        email: identity.email,
        unit: identity.unit,
        role: identity.role,
        clearance: identity.clearance,
        scopes: identity.scopes,
      },
    });

    return { ...identity, id: actor.id };
  }
}
