import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../request-context/request-context.service.js';

interface ExceptionPayload {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly prisma: PrismaService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = this.requestContext.getRequestId() ?? 'unknown';
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.getPayload(exception);

    await this.auditDeniedSensitiveAccess(request, status, payload.code).catch((error: unknown) =>
      this.logger.error(
        JSON.stringify({
          level: 'error',
          message: 'Failed to persist access denial audit',
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );

    if (!(exception instanceof HttpException)) {
      const error = exception instanceof Error ? exception : new Error('Unknown server error');
      this.logger.error(
        JSON.stringify({
          level: 'error',
          message: 'Unhandled API exception',
          requestId,
          method: request.method,
          path: request.originalUrl,
          errorName: error.name,
          stack: error.stack,
        }),
      );
    }

    response.status(status).json({
      code: payload.code,
      message: payload.message,
      ...(payload.details === undefined ? {} : { details: payload.details }),
      requestId,
    });
  }

  private async auditDeniedSensitiveAccess(
    request: Request,
    status: number,
    code: string,
  ): Promise<void> {
    if (status !== 403 && status !== 404) return;
    const context = this.requestContext.get();
    if (!context?.tenantId || !context.userId) return;
    const path = request.path;
    const match = path.match(
      /^\/api\/v\d+\/(?:admin\/)?(customers|rates|quotes|bookings|shipments|documents|invoices)(?:\/([^/]+))?/,
    );
    if (!match) return;
    const entityType = this.entityType(match[1]!);
    const routeId = request.params?.id;
    const candidateId =
      typeof routeId === 'string'
        ? routeId
        : Array.isArray(routeId)
          ? (routeId[0] ?? 'collection')
          : (match[2] ?? 'collection');
    const entityId = candidateId.slice(0, 100);
    await this.prisma.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        entityType,
        entityId,
        action: 'ACCESS_DENIED',
        afterData: {
          status,
          code,
          method: request.method,
          path,
          requestId: context.requestId,
        },
        ipAddress: request.ip?.slice(0, 64),
        userAgent: request.header('user-agent')?.slice(0, 1000),
      },
    });
  }

  private entityType(segment: string): string {
    const names: Record<string, string> = {
      customers: 'CustomerCompany',
      rates: 'Rate',
      quotes: 'Quote',
      bookings: 'Booking',
      shipments: 'Shipment',
      documents: 'Document',
      invoices: 'Invoice',
    };
    return names[segment] ?? 'SensitiveResource';
  }

  private getPayload(exception: unknown): { code: string; message: string; details?: unknown } {
    if (!(exception instanceof HttpException)) {
      return { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' };
    }

    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { code: this.defaultCode(status), message: response };
    }

    const payload = response as ExceptionPayload;
    const validationMessages = Array.isArray(payload.message)
      ? payload.message.filter((message): message is string => typeof message === 'string')
      : undefined;

    return {
      code:
        typeof payload.code === 'string'
          ? payload.code
          : validationMessages
            ? 'VALIDATION_ERROR'
            : this.defaultCode(status),
      message:
        typeof payload.message === 'string'
          ? payload.message
          : validationMessages
            ? 'Request validation failed'
            : exception.message,
      details: validationMessages
        ? {
            errors: validationMessages,
            fieldErrors: this.validationFieldErrors(validationMessages),
          }
        : payload.details,
    };
  }

  private validationFieldErrors(messages: string[]): Record<string, string[]> {
    return messages.reduce<Record<string, string[]>>((result, message) => {
      const field = message.match(/^([A-Za-z0-9_.[\]]+)\s/)?.[1];
      if (!field) return result;
      (result[field] ??= []).push(message);
      return result;
    }, {});
  }

  private defaultCode(status: number): string {
    return HttpStatus[status] ?? 'HTTP_ERROR';
  }
}
