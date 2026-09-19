import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import type { ActorContext } from './actor.types.js';

export interface AuthenticatedRequest extends Request {
  actor?: ActorContext;
}

/** Secure by default: every route requires an authenticated actor unless marked public. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.actor = await this.authService.resolveActor(request);
    return true;
  }
}
