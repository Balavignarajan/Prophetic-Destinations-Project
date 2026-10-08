export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound protects the hasher from huge inputs. */
export const PASSWORD_MAX_LENGTH = 128;

/** Returns the reasons a new password is unacceptable (empty when it is fine). */
export function checkPasswordPolicy(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  return problems;
}
