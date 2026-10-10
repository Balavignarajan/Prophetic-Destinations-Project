import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

/** No legitimate request body nests deeper than this (rich text, the deepest, needs about 20). */
export const MAX_JSON_DEPTH = 64;

/** Nesting depth of a parsed JSON value, measured without recursion so any input is safe to measure. */
export function jsonDepthExceeds(value: unknown, limit: number): boolean {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop()!;
    if (typeof current !== 'object' || current === null) continue;
    if (depth > limit) return true;
    for (const child of Object.values(current)) {
      if (typeof child === 'object' && child !== null)
        stack.push([child, depth + 1]);
    }
  }
  return false;
}

/**
 * Rejects absurdly nested request bodies before validation runs. Interceptors run
 * before pipes, and the validation pipe's object conversion recurses, so without
 * this a deeply nested body could exhaust the stack and surface as a 500.
 */
@Injectable()
export class JsonDepthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (jsonDepthExceeds(req.body, MAX_JSON_DEPTH)) {
      throw new BadRequestException({
        code: 'BODY_TOO_DEEPLY_NESTED',
        message: `Request body is nested too deeply (limit ${MAX_JSON_DEPTH})`,
      });
    }
    return next.handle();
  }
}
