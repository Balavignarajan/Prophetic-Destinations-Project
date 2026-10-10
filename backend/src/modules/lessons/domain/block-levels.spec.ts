import { BusinessRuleError } from '../../../shared-kernel/index.js';
import { BlockTypeRegistry } from './blocks/registry.js';
import { checkLessonHasLevel, checkVariantAllowed } from './block-levels.js';
import { jsonContentEquals } from './json-equality.js';

describe('checkVariantAllowed', () => {
  const definition = new BlockTypeRegistry().require('RICH_TEXT');

  it('allows variants only for SUPPORTED types', () => {
    expect(() =>
      checkVariantAllowed({ ...definition, variants: 'SUPPORTED' }),
    ).not.toThrow();
  });

  it.each(['UNCONFIRMED', 'NOT_SUPPORTED'] as const)(
    'refuses %s types',
    (variants) => {
      try {
        checkVariantAllowed({ ...definition, variants });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessRuleError);
        expect((error as BusinessRuleError).details).toEqual({
          type: 'RICH_TEXT',
          variants,
        });
      }
    },
  );

  it('the real registry does not allow RICH_TEXT variants (unconfirmed)', () => {
    expect(() => checkVariantAllowed(definition)).toThrow(BusinessRuleError);
  });
});

describe('checkLessonHasLevel', () => {
  it('accepts a level the lesson has and rejects one it does not', () => {
    expect(() =>
      checkLessonHasLevel(['BEGINNER', 'ADVANCED'], 'ADVANCED'),
    ).not.toThrow();
    expect(() => checkLessonHasLevel(['BEGINNER'], 'ADVANCED')).toThrow(
      BusinessRuleError,
    );
    expect(() => checkLessonHasLevel([], 'BEGINNER')).toThrow(
      BusinessRuleError,
    );
  });
});

describe('jsonContentEquals (what counts as "the same content" for a no-op write)', () => {
  it('null only equals null', () => {
    expect(jsonContentEquals(null, null)).toBe(true);
    expect(jsonContentEquals(null, {})).toBe(false);
    expect(jsonContentEquals({}, null)).toBe(false);
  });

  it('object key order does not matter, at any depth (jsonb does not keep it either)', () => {
    expect(
      jsonContentEquals(
        { a: 1, b: { c: 2, d: 3 } },
        { b: { d: 3, c: 2 }, a: 1 },
      ),
    ).toBe(true);
  });

  it('array order and values do matter', () => {
    expect(jsonContentEquals({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(jsonContentEquals({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
  });

  it('values must match exactly: types, strings, extra and missing keys', () => {
    expect(jsonContentEquals({ a: 1 }, { a: '1' })).toBe(false);
    expect(jsonContentEquals({ a: 'x' }, { a: 'x ' })).toBe(false);
    expect(jsonContentEquals({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(jsonContentEquals({ a: null }, { a: 0 })).toBe(false);
  });

  it('empty objects are equal to each other but not to null', () => {
    expect(jsonContentEquals({}, {})).toBe(true);
  });
});
