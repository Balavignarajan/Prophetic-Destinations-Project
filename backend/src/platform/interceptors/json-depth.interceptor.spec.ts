import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import {
  JsonDepthInterceptor,
  MAX_JSON_DEPTH,
  jsonDepthExceeds,
} from './json-depth.interceptor.js';

const nested = (levels: number): unknown => {
  let value: unknown = 1;
  for (let i = 0; i < levels; i += 1) value = { a: [value] };
  return value;
};

describe('jsonDepthExceeds', () => {
  it('is false for scalars, empty and shallow values', () => {
    for (const value of [
      undefined,
      null,
      5,
      'x',
      {},
      [],
      { a: 1 },
      [[1], [2]],
    ]) {
      expect(jsonDepthExceeds(value, 3)).toBe(false);
    }
  });

  it('counts objects and arrays as levels, and compares against the limit', () => {
    expect(jsonDepthExceeds({ a: { b: 1 } }, 2)).toBe(false);
    expect(jsonDepthExceeds({ a: { b: { c: 1 } } }, 2)).toBe(true);
    expect(jsonDepthExceeds([[[1]]], 3)).toBe(false);
    expect(jsonDepthExceeds([[[[1]]]], 3)).toBe(true);
  });

  it('measures absurd nesting without overflowing the stack', () => {
    expect(jsonDepthExceeds(nested(200_000), MAX_JSON_DEPTH)).toBe(true);
  });
});

describe('JsonDepthInterceptor', () => {
  const run = (body: unknown) => {
    const interceptor = new JsonDepthInterceptor();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ body }) }),
    } as never;
    return interceptor.intercept(context, { handle: () => of('ok') });
  };

  it('lets ordinary bodies through', () => {
    expect(() => run({ title: 'x', levels: ['BEGINNER'] })).not.toThrow();
    expect(() => run(undefined)).not.toThrow();
  });

  it('rejects an over-nested body with a client error and a stable code', () => {
    try {
      run(nested(MAX_JSON_DEPTH));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'BODY_TOO_DEEPLY_NESTED',
      });
    }
  });
});
