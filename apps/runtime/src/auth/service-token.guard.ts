import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * First-party caller authentication.
 *
 * The runtime executes work; anything that can reach it can act. A shared
 * service token is the minimum, and it is compared in constant time so a
 * near-miss reveals nothing about how near it was.
 *
 * When no token is configured the runtime refuses every request rather than
 * running open: an execution layer that defaults to unauthenticated is the
 * worst possible default, and a deployment that forgot to set one should find
 * out immediately rather than after something ran.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.TANIA_RUNTIME_TOKEN ?? '';

    if (expected.length === 0) {
      throw new UnauthorizedException('Runtime has no TANIA_RUNTIME_TOKEN configured.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid service token.');
    }

    return true;
  }
}
