import { BusinessRuleError } from './domain-error.js';
import {
  checkReorder,
  positionsFor,
  resolveInsertPosition,
} from './ordering.js';

describe('insert position', () => {
  it('appends when no position is given', () => {
    expect(resolveInsertPosition(undefined, 0)).toBe(1);
    expect(resolveInsertPosition(undefined, 3)).toBe(4);
  });

  it('accepts any position from 1 up to one past the end', () => {
    expect(resolveInsertPosition(1, 3)).toBe(1);
    expect(resolveInsertPosition(2, 3)).toBe(2);
    expect(resolveInsertPosition(4, 3)).toBe(4);
  });

  it.each([0, -1, 5, 1.5])(
    'rejects position %s for a course with 3 modules',
    (position) => {
      expect(() => resolveInsertPosition(position, 3)).toThrow(
        BusinessRuleError,
      );
    },
  );

  it('only accepts position 1 for an empty course', () => {
    expect(resolveInsertPosition(1, 0)).toBe(1);
    expect(() => resolveInsertPosition(2, 0)).toThrow(BusinessRuleError);
  });

  it('explains the valid range', () => {
    try {
      resolveInsertPosition(9, 3);
      expect.unreachable();
    } catch (error) {
      expect((error as BusinessRuleError).details).toEqual({ min: 1, max: 4 });
    }
  });
});

describe('reorder', () => {
  const current = ['a', 'b', 'c'];

  it('accepts any permutation', () => {
    expect(() => checkReorder(current, ['c', 'a', 'b'])).not.toThrow();
    expect(() => checkReorder(current, current)).not.toThrow();
    expect(() => checkReorder([], [])).not.toThrow();
  });

  it('rejects missing modules', () => {
    expect(() => checkReorder(current, ['a', 'b'])).toThrow(BusinessRuleError);
  });

  it('rejects unknown modules', () => {
    expect(() => checkReorder(current, ['a', 'b', 'c', 'x'])).toThrow(
      BusinessRuleError,
    );
  });

  it('rejects duplicates', () => {
    expect(() => checkReorder(current, ['a', 'a', 'b'])).toThrow(
      BusinessRuleError,
    );
  });

  it('reports exactly what is wrong', () => {
    try {
      checkReorder(current, ['a', 'a', 'x']);
      expect.unreachable();
    } catch (error) {
      expect((error as BusinessRuleError).details).toEqual({
        duplicates: ['a'],
        unknown: ['x'],
        missing: ['b', 'c'],
      });
    }
  });

  it('assigns consecutive 1-based positions', () => {
    expect(positionsFor(['x', 'y', 'z'])).toEqual([1, 2, 3]);
    expect(positionsFor([])).toEqual([]);
  });
});
