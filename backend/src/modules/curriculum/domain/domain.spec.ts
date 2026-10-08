import {
  BusinessRuleError,
  ConflictError,
} from '../../../shared-kernel/index.js';
import { CONTENT_STATUSES, statusAfterEdit } from './content-status.js';
import {
  checkReorder,
  positionsFor,
  resolveInsertPosition,
} from './ordering.js';
import {
  TITLE_MAX_LENGTH,
  checkTextChanges,
  checkTitle,
  normalizeDescription,
} from './text-rules.js';
import { checkExpectedVersion } from './versioning.js';

describe('title rules', () => {
  it('trims', () => {
    expect(checkTitle('  Foundations  ')).toBe('Foundations');
  });

  it('rejects blank titles', () => {
    expect(() => checkTitle('')).toThrow(BusinessRuleError);
    expect(() => checkTitle('   \n\t ')).toThrow(BusinessRuleError);
  });

  it('enforces the length limit after trimming', () => {
    expect(checkTitle(` ${'x'.repeat(TITLE_MAX_LENGTH)} `)).toHaveLength(
      TITLE_MAX_LENGTH,
    );
    expect(() => checkTitle('x'.repeat(TITLE_MAX_LENGTH + 1))).toThrow(
      BusinessRuleError,
    );
  });
});

describe('description rules', () => {
  it('stores blank descriptions as null', () => {
    expect(normalizeDescription(undefined)).toBeNull();
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription('   ')).toBeNull();
  });

  it('trims real descriptions', () => {
    expect(normalizeDescription('  hello ')).toBe('hello');
  });
});

describe('checkTextChanges', () => {
  it('keeps only the fields that were provided', () => {
    expect(checkTextChanges({ title: ' New ' })).toEqual({ title: 'New' });
    expect(checkTextChanges({ description: 'd' })).toEqual({
      description: 'd',
    });
  });

  it('lets null clear the description', () => {
    expect(checkTextChanges({ description: null })).toEqual({
      description: null,
    });
  });

  it('rejects an empty update', () => {
    expect(() => checkTextChanges({})).toThrow(BusinessRuleError);
  });

  it('validates a provided title', () => {
    expect(() => checkTextChanges({ title: '  ' })).toThrow(BusinessRuleError);
  });
});

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

describe('optimistic version check', () => {
  it('passes when no version is given or it matches', () => {
    expect(() => checkExpectedVersion(3, undefined)).not.toThrow();
    expect(() => checkExpectedVersion(3, 3)).not.toThrow();
  });

  it('raises a conflict that reports the current version when stale', () => {
    try {
      checkExpectedVersion(4, 3);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ currentVersion: 4 });
    }
  });
});

describe('content status', () => {
  it('has the four lifecycle states in order', () => {
    expect([...CONTENT_STATUSES]).toEqual([
      'DRAFT',
      'READY_FOR_REVIEW',
      'APPROVED',
      'PUBLISHED',
    ]);
  });

  it('goes back to DRAFT whenever content is edited', () => {
    for (const status of CONTENT_STATUSES) {
      expect(statusAfterEdit(status)).toBe('DRAFT');
    }
  });
});
