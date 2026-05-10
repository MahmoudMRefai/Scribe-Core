/**
 * Custom Business Exception hierarchy for Scribe.
 *
 * Every exception carries:
 *  - HTTP status code
 *  - Machine-readable error code (for API consumers)
 *  - Human-readable message
 *
 * The global error handler catches these and returns a standardized response.
 */

export class BusinessException extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BUSINESS_ERROR') {
    super(message);
    this.name = 'BusinessException';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, BusinessException.prototype);
  }
}

/** Resource not found (404) */
export class NotFoundException extends BusinessException {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(msg, 404, 'NOT_FOUND');
    this.name = 'NotFoundException';
  }
}

/** Authentication required or invalid credentials (401) */
export class UnauthorizedException extends BusinessException {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedException';
  }
}

/** Authenticated but lacking permission (403) */
export class ForbiddenException extends BusinessException {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenException';
  }
}

/** Conflict — e.g., invalid status transition, duplicate resource (409) */
export class ConflictException extends BusinessException {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictException';
  }
}

/** Business rule violation — e.g., insufficient funds (422) */
export class InsufficientFundsException extends BusinessException {
  constructor(accountId: string, required: string, available: string) {
    super(
      `Insufficient funds in account '${accountId}': requires ${required}, available ${available}`,
      422,
      'INSUFFICIENT_FUNDS',
    );
    this.name = 'InsufficientFundsException';
  }
}

/** Validation error — e.g., Zod parse failure (400) */
export class ValidationException extends BusinessException {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationException';
    this.details = details;
  }
}
