import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { requestIdOf } from './correlation.middleware.js';

/** The correlation id assigned to this request by `CorrelationMiddleware`. */
export const CurrentRequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    requestIdOf(context.switchToHttp().getRequest<Request>()),
);
