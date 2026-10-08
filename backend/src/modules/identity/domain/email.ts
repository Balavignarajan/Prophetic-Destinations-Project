/** Emails are stored and compared trimmed and lower-cased. The database enforces the same rule. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 320 && EMAIL_SHAPE.test(email);
}
