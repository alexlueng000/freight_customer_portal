import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service.js';

const validRequestIdPattern = /^[A-Za-z0-9._-]{1,100}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const suppliedRequestId = req.header('x-request-id');
    const requestId =
      suppliedRequestId && validRequestIdPattern.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();

    res.setHeader('x-request-id', requestId);
    this.requestContext.run({ requestId, roles: [] }, next);
  }
}
