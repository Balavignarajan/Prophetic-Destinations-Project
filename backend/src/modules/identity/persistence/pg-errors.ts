/** PostgreSQL error code for a unique constraint violation. */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    driverError?: { code?: string };
  } | null;
  return (
    candidate?.code === UNIQUE_VIOLATION ||
    candidate?.driverError?.code === UNIQUE_VIOLATION
  );
}
