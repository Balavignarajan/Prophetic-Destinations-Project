import { BusinessRuleError } from '../../../shared-kernel/index.js';
import {
  LIMITS,
  checkCoverMediaId,
  checkEstimatedMinutes,
  checkLessonChanges,
  checkLevels,
  checkOptionalText,
  checkTitle,
} from './lesson-rules.js';

describe('title', () => {
  it('is trimmed', () => {
    expect(checkTitle('  The Beginning ')).toBe('The Beginning');
  });

  it('must not be blank', () => {
    expect(() => checkTitle('')).toThrow(BusinessRuleError);
    expect(() => checkTitle(' \n\t ')).toThrow(BusinessRuleError);
  });

  it('is rejected, never truncated, when too long', () => {
    expect(checkTitle('x'.repeat(LIMITS.title))).toHaveLength(LIMITS.title);
    expect(() => checkTitle('x'.repeat(LIMITS.title + 1))).toThrow(
      BusinessRuleError,
    );
  });

  it('rejects characters the database cannot store', () => {
    expect(() => checkTitle('bad\u0000title')).toThrow(BusinessRuleError);
  });
});

describe('optional text fields', () => {
  it.each(['shortTitle', 'subtitle', 'introduction'] as const)(
    '%s: undefined, null and blank all mean "none"',
    (field) => {
      expect(checkOptionalText(undefined, field)).toBeNull();
      expect(checkOptionalText(null, field)).toBeNull();
      expect(checkOptionalText('  \n ', field)).toBeNull();
    },
  );

  it.each([
    ['shortTitle', 100],
    ['subtitle', 300],
    ['introduction', 5000],
  ] as const)('%s allows %i characters and rejects one more', (field, max) => {
    expect(checkOptionalText('x'.repeat(max), field)).toHaveLength(max);
    expect(() => checkOptionalText('x'.repeat(max + 1), field)).toThrow(
      BusinessRuleError,
    );
  });

  it('limits are the approved ones', () => {
    expect(LIMITS).toEqual({
      title: 200,
      shortTitle: 100,
      subtitle: 300,
      introduction: 5000,
    });
  });

  it('keeps paragraphs in the introduction and normalises line endings', () => {
    expect(
      checkOptionalText(
        'First paragraph.\r\n\r\nSecond paragraph.\r\n',
        'introduction',
      ),
    ).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('counts the limit after trimming', () => {
    expect(
      checkOptionalText(` ${'x'.repeat(100)} `, 'shortTitle'),
    ).toHaveLength(100);
  });

  it('rejects NUL characters', () => {
    expect(() => checkOptionalText('a\u0000b', 'subtitle')).toThrow(
      BusinessRuleError,
    );
  });
});

describe('estimated minutes', () => {
  it('accepts whole numbers of at least 1, and "none"', () => {
    expect(checkEstimatedMinutes(1)).toBe(1);
    expect(checkEstimatedMinutes(45)).toBe(45);
    expect(checkEstimatedMinutes(null)).toBeNull();
    expect(checkEstimatedMinutes(undefined)).toBeNull();
  });

  it.each([0, -5, 1.5, Number.NaN, 2_147_483_648])('rejects %s', (value) => {
    expect(() => checkEstimatedMinutes(value)).toThrow(BusinessRuleError);
  });
});

describe('cover media', () => {
  it('can only be empty until the Media module exists', () => {
    expect(checkCoverMediaId(null)).toBeNull();
    expect(checkCoverMediaId(undefined)).toBeNull();
    expect(() =>
      checkCoverMediaId('0d3c6b5e-0000-4000-8000-000000000000'),
    ).toThrow(BusinessRuleError);
  });
});

describe('levels', () => {
  it('returns a valid set in canonical order', () => {
    expect(checkLevels(['ADVANCED', 'BEGINNER'])).toEqual([
      'BEGINNER',
      'ADVANCED',
    ]);
    expect(checkLevels(['INTERMEDIATE', 'ADVANCED', 'BEGINNER'])).toEqual([
      'BEGINNER',
      'INTERMEDIATE',
      'ADVANCED',
    ]);
  });

  it('allows no levels (a draft that is not configured yet)', () => {
    expect(checkLevels([])).toEqual([]);
  });

  it('rejects unknown levels and reports them', () => {
    try {
      checkLevels(['BEGINNER', 'EXPERT', 'beginner']);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).details).toMatchObject({
        unknown: ['EXPERT', 'beginner'],
      });
    }
  });

  it('rejects duplicates instead of silently merging them', () => {
    expect(() => checkLevels(['BEGINNER', 'BEGINNER'])).toThrow(
      BusinessRuleError,
    );
  });
});

describe('checkLessonChanges', () => {
  it('keeps only the fields that were provided', () => {
    expect(checkLessonChanges({ title: ' New ' })).toEqual({ title: 'New' });
    expect(checkLessonChanges({ subtitle: ' s ' })).toEqual({ subtitle: 's' });
  });

  it('lets null (and blank) clear an optional field', () => {
    expect(checkLessonChanges({ shortTitle: null })).toEqual({
      shortTitle: null,
    });
    expect(checkLessonChanges({ introduction: '   ' })).toEqual({
      introduction: null,
    });
    expect(checkLessonChanges({ estimatedMinutes: null })).toEqual({
      estimatedMinutes: null,
    });
  });

  it('rejects an empty update', () => {
    expect(() => checkLessonChanges({})).toThrow(BusinessRuleError);
  });

  it('validates every provided field', () => {
    expect(() => checkLessonChanges({ title: ' ' })).toThrow(BusinessRuleError);
    expect(() => checkLessonChanges({ estimatedMinutes: 0 })).toThrow(
      BusinessRuleError,
    );
    expect(() =>
      checkLessonChanges({ subtitle: 'x'.repeat(LIMITS.subtitle + 1) }),
    ).toThrow(BusinessRuleError);
  });
});
