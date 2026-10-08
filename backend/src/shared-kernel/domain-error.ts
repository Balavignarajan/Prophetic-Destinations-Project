/**
 * Base for errors raised by business rules. Domain and application code throw
 * these; the global exception filter maps them to HTTP responses.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested thing does not exist (404). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/** The request conflicts with current state, e.g. duplicates or stale edits (409). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

/** The request is well-formed but breaks a business rule (422). */
export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
}

/** The caller is not authenticated, or the credentials are invalid (401). */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
}

/** The caller is authenticated but not allowed to do this (403). */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}
