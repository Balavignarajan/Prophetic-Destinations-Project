/** PostgreSQL error codes the application translates into domain errors. */
const UNIQUE_VIOLATION = '23505';
/** 23503 foreign_key_violation (insert/NO ACTION), 23001 restrict_violation (ON DELETE RESTRICT). */
const FOREIGN_KEY_VIOLATION = '23503';
const RESTRICT_VIOLATION = '23001';
/** 55P03 lock_not_available: a statement waited longer than `lock_timeout` for a lock. */
const LOCK_NOT_AVAILABLE = '55P03';
/** 40P01 deadlock_detected: PostgreSQL aborted this transaction to break a deadlock. */
const DEADLOCK_DETECTED = '40P01';
/** 40001 serialization_failure: a concurrent update made this transaction unable to proceed. */
const SERIALIZATION_FAILURE = '40001';

function hasCode(error: unknown, code: string): boolean {
  const candidate = error as {
    code?: string;
    driverError?: { code?: string };
  } | null;
  return candidate?.code === code || candidate?.driverError?.code === code;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return (
    hasCode(error, FOREIGN_KEY_VIOLATION) || hasCode(error, RESTRICT_VIOLATION)
  );
}

/** A statement gave up waiting for a lock (`lock_timeout`). Nothing was changed; retrying later is safe. */
export function isLockTimeout(error: unknown): boolean {
  return hasCode(error, LOCK_NOT_AVAILABLE);
}

/** PostgreSQL rolled the transaction back because of a deadlock or a concurrent-update conflict. Retrying is safe. */
export function isConcurrencyFailure(error: unknown): boolean {
  return (
    hasCode(error, DEADLOCK_DETECTED) || hasCode(error, SERIALIZATION_FAILURE)
  );
}
