/** PostgreSQL error codes the application translates into domain errors. */
const UNIQUE_VIOLATION = '23505';
/** 23503 foreign_key_violation (insert/NO ACTION), 23001 restrict_violation (ON DELETE RESTRICT). */
const FOREIGN_KEY_VIOLATION = '23503';
const RESTRICT_VIOLATION = '23001';

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
