import { ERROR_CODE } from '../config/constants.js';

/**
 * Base application error with structured error response support.
 *
 * All custom errors extend this class and provide:
 * - `code`: machine-readable error code from ERROR_CODE constants
 * - `statusCode`: HTTP status code for API responses
 * - `details`: optional extra context (validation errors, etc.)
 * - `toResponse()`: serialise to the standard API error envelope
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  /** Serialise to the standard `{ error: { code, message, timestamp } }` envelope. */
  toResponse(): { error: { code: string; message: string; timestamp: string } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/** 400 — request payload or query params failed validation. */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODE.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}

/** 404 — requested resource does not exist (or tenant cannot see it). */
export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODE.NOT_FOUND, message, 404, details);
    this.name = 'NotFoundError';
  }
}

/** 401 — missing or invalid API key. */
export class UnauthorizedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODE.UNAUTHORIZED, message, 401, details);
    this.name = 'UnauthorizedError';
  }
}

/** 403 — authenticated but not permitted (e.g. inactive tenant). */
export class ForbiddenError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODE.FORBIDDEN, message, 403, details);
    this.name = 'ForbiddenError';
  }
}

/** 409 — resource already exists or conflicts with current state. */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODE.CONFLICT, message, 409, details);
    this.name = 'ConflictError';
  }
}
