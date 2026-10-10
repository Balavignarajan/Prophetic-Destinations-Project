import {
  BusinessRuleError,
  CONTENT_STATUSES,
  statusAfterEdit,
} from '../../../shared-kernel/index.js';
import {
  TITLE_MAX_LENGTH,
  checkTextChanges,
  checkTitle,
  normalizeDescription,
} from './text-rules.js';

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
