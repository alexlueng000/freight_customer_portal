import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequestContextService } from '../request-context/request-context.service.js';

interface ExceptionPayload {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = this.requestContext.getRequestId() ?? 'unknown';
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.getPayload(exception);

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

  private getPayload(exception: unknown): Required<Pick<ExceptionPayload, 'code' | 'message'>> &
    Pick<ExceptionPayload, 'details'> {
    if (!(exception instanceof HttpException)) {
      return { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' };
    }

    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { code: this.defaultCode(status), message: response };
    }

    const payload = response as ExceptionPayload;
    const validationMessages = Array.isArray(payload.message) ? payload.message : undefined;

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
      details: validationMessages ? { errors: validationMessages } : payload.details,
    };
  }

  private defaultCode(status: number): string {
    return HttpStatus[status] ?? 'HTTP_ERROR';
  }
}
