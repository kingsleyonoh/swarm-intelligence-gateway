import { describe, it, expect } from 'vitest';

import { ERROR_CODE } from '../../src/config/constants.js';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from '../../src/shared/errors.js';

describe('AppError', () => {
  it('should instantiate with code, message, and default statusCode 500', () => {
    const err = new AppError('INTERNAL_ERROR', 'Something went wrong');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('AppError');
  });

  it('should accept a custom statusCode', () => {
    const err = new AppError('CUSTOM', 'Custom error', 418);
    expect(err.statusCode).toBe(418);
  });

  it('should accept optional details', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const err = new AppError('VALIDATION_ERROR', 'Bad input', 400, details);

    expect(err.details).toEqual(details);
  });

  it('should have undefined details when not provided', () => {
    const err = new AppError('INTERNAL_ERROR', 'Oops');
    expect(err.details).toBeUndefined();
  });

  it('should serialize to response format via toResponse()', () => {
    const err = new AppError('NOT_FOUND', 'Resource not found', 404);
    const response = err.toResponse();

    expect(response).toHaveProperty('error');
    expect(response.error).toHaveProperty('code', 'NOT_FOUND');
    expect(response.error).toHaveProperty('message', 'Resource not found');
    expect(response.error).toHaveProperty('timestamp');

    // timestamp should be a valid ISO string
    const parsed = Date.parse(response.error.timestamp);
    expect(Number.isNaN(parsed)).toBe(false);
  });

  it('should produce a stack trace', () => {
    const err = new AppError('INTERNAL_ERROR', 'With stack');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('AppError');
  });
});

describe('ValidationError', () => {
  it('should be an instance of AppError and Error', () => {
    const err = new ValidationError('Invalid input');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('should have statusCode 400', () => {
    const err = new ValidationError('Bad data');
    expect(err.statusCode).toBe(400);
  });

  it('should use VALIDATION_ERROR error code', () => {
    const err = new ValidationError('Bad data');
    expect(err.code).toBe(ERROR_CODE.VALIDATION_ERROR);
  });

  it('should have name ValidationError', () => {
    const err = new ValidationError('Bad data');
    expect(err.name).toBe('ValidationError');
  });

  it('should accept optional details', () => {
    const details = [{ field: 'name', issue: 'required' }];
    const err = new ValidationError('Missing fields', details);
    expect(err.details).toEqual(details);
  });

  it('should serialize to correct response format', () => {
    const err = new ValidationError('Missing required field');
    const response = err.toResponse();

    expect(response.error.code).toBe('VALIDATION_ERROR');
    expect(response.error.message).toBe('Missing required field');
  });
});

describe('NotFoundError', () => {
  it('should have statusCode 404', () => {
    const err = new NotFoundError('Not found');
    expect(err.statusCode).toBe(404);
  });

  it('should use NOT_FOUND error code', () => {
    const err = new NotFoundError('Resource missing');
    expect(err.code).toBe(ERROR_CODE.NOT_FOUND);
  });

  it('should have name NotFoundError', () => {
    const err = new NotFoundError('Gone');
    expect(err.name).toBe('NotFoundError');
  });

  it('should be an instance of AppError', () => {
    const err = new NotFoundError('Missing');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('UnauthorizedError', () => {
  it('should have statusCode 401', () => {
    const err = new UnauthorizedError('No auth');
    expect(err.statusCode).toBe(401);
  });

  it('should use UNAUTHORIZED error code', () => {
    const err = new UnauthorizedError('Invalid key');
    expect(err.code).toBe(ERROR_CODE.UNAUTHORIZED);
  });

  it('should have name UnauthorizedError', () => {
    const err = new UnauthorizedError('Bad key');
    expect(err.name).toBe('UnauthorizedError');
  });
});

describe('ForbiddenError', () => {
  it('should have statusCode 403', () => {
    const err = new ForbiddenError('Not allowed');
    expect(err.statusCode).toBe(403);
  });

  it('should use FORBIDDEN error code', () => {
    const err = new ForbiddenError('Access denied');
    expect(err.code).toBe(ERROR_CODE.FORBIDDEN);
  });

  it('should have name ForbiddenError', () => {
    const err = new ForbiddenError('Nope');
    expect(err.name).toBe('ForbiddenError');
  });
});

describe('ConflictError', () => {
  it('should have statusCode 409', () => {
    const err = new ConflictError('Already exists');
    expect(err.statusCode).toBe(409);
  });

  it('should use CONFLICT error code', () => {
    const err = new ConflictError('Duplicate');
    expect(err.code).toBe(ERROR_CODE.CONFLICT);
  });

  it('should have name ConflictError', () => {
    const err = new ConflictError('Conflict');
    expect(err.name).toBe('ConflictError');
  });

  it('should serialize to response format', () => {
    const err = new ConflictError('Duplicate entry');
    const response = err.toResponse();

    expect(response.error.code).toBe('CONFLICT');
    expect(response.error.message).toBe('Duplicate entry');
    expect(response.error.timestamp).toBeDefined();
  });
});
