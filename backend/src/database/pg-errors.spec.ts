import {
  isConcurrencyFailure,
  isForeignKeyViolation,
  isLockTimeout,
  isUniqueViolation,
} from './pg-errors.js';

const withCode = (code: string) => ({ driverError: { code } });

describe('pg error detection', () => {
  it('recognises unique violations', () => {
    expect(isUniqueViolation(withCode('23505'))).toBe(true);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(withCode('23503'))).toBe(false);
  });

  it('treats both foreign key and ON DELETE RESTRICT violations as foreign key violations', () => {
    expect(isForeignKeyViolation(withCode('23503'))).toBe(true);
    expect(isForeignKeyViolation(withCode('23001'))).toBe(true);
    expect(isForeignKeyViolation(withCode('23505'))).toBe(false);
  });

  it('ignores anything else', () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });

  it('recognises a lock timeout, and a deadlock or serialization failure as a concurrency failure', () => {
    expect(isLockTimeout(withCode('55P03'))).toBe(true);
    expect(isLockTimeout({ code: '55P03' })).toBe(true);
    expect(isLockTimeout(withCode('40P01'))).toBe(false);
    expect(isConcurrencyFailure(withCode('40P01'))).toBe(true);
    expect(isConcurrencyFailure(withCode('40001'))).toBe(true);
    expect(isConcurrencyFailure(withCode('55P03'))).toBe(false);
    expect(isConcurrencyFailure(undefined)).toBe(false);
  });
});
