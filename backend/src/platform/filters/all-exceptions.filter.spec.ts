import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared-kernel/index.js';
import { toErrorBody } from './all-exceptions.filter.js';

describe('toErrorBody', () => {
  it.each([
    [new NotFoundError('missing'), 404, 'NOT_FOUND'],
    [new ConflictError('stale'), 409, 'CONFLICT'],
    [new UnauthorizedError('who?'), 401, 'UNAUTHORIZED'],
    [new ForbiddenError('no'), 403, 'FORBIDDEN'],
    [new BusinessRuleError('nope', { why: 1 }), 422, 'BUSINESS_RULE_VIOLATION'],
  ])('maps domain error %#', (error, statusCode, code) => {
    expect(toErrorBody(error)).toMatchObject({ statusCode, code });
  });

  it('keeps domain error details', () => {
    expect(
      toErrorBody(new BusinessRuleError('nope', { why: 1 })).details,
    ).toEqual({
      why: 1,
    });
  });

  it('maps Nest HTTP exceptions', () => {
    expect(toErrorBody(new ForbiddenException())).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('uses the code and details of validation failures', () => {
    const body = toErrorBody(
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ field: 'title', messages: ['required'] }],
      }),
    );
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: [{ field: 'title', messages: ['required'] }],
    });
  });

  it('maps client errors from Express middleware', () => {
    expect(toErrorBody({ status: 413 })).toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('hides the details of unexpected errors', () => {
    expect(toErrorBody(new Error('password=secret'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
