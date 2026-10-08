import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';

/**
 * One log line per successful request: method, url, status, duration, request id.
 * Failed requests are logged by the exception filter with their final status.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms [${req.header(REQUEST_ID_HEADER)}]`,
        );
      }),
    );
  }
}
