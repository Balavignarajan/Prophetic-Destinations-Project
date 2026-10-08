import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared-kernel/index.js';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'BUSINESS_RULE_VIOLATION',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/** The single place that turns any thrown error into the API's error shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = req.header(REQUEST_ID_HEADER);

    const body = { ...toErrorBody(exception), requestId };

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} ${body.statusCode} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${req.method} ${req.originalUrl} ${body.statusCode} ${body.code} [${requestId}]`,
      );
    }

    res.status(body.statusCode).json(body);
  }
}

export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof DomainError) {
    return {
      statusCode: domainStatus(exception),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const payload =
      typeof response === 'object' ? (response as Record<string, unknown>) : {};
    const message =
      typeof response === 'string'
        ? response
        : typeof payload.message === 'string'
          ? payload.message
          : exception.message;
    return {
      statusCode: status,
      code:
        typeof payload.code === 'string'
          ? payload.code
          : (HTTP_CODES[status] ?? 'ERROR'),
      message,
      details: payload.details,
    };
  }

  // Errors from Express middleware (e.g. malformed JSON, oversized body).
  const status = (exception as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return {
      statusCode: status,
      code: HTTP_CODES[status] ?? 'BAD_REQUEST',
      message: status === 413 ? 'Request body too large' : 'Invalid request',
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  };
}

function domainStatus(error: DomainError): number {
  if (error instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
  if (error instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof BusinessRuleError)
    return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.BAD_REQUEST;
}
