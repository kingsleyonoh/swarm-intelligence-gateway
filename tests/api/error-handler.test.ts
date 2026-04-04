import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { buildApp } from '../../src/api/server.js';
import {
  ValidationError,
  NotFoundError,
  AppError,
} from '../../src/shared/errors.js';

import type { FastifyInstance } from 'fastify';

/**
 * Tests for the global error handler middleware.
 *
 * These tests verify that errors thrown inside route handlers are
 * caught and serialized to the standard { error: { code, message, timestamp } } envelope.
 *
 * No database required — uses synthetic test routes that throw known errors.
 */
describe('Global error handler', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build app WITHOUT calling ready() yet — so we can add test routes
    app = buildApp({ logger: false });

    // Register synthetic test routes BEFORE ready()
    app.get('/test/validation-error', async () => {
      throw new ValidationError('Name is required');
    });

    app.get('/test/not-found-error', async () => {
      throw new NotFoundError('Resource not found');
    });

    app.get('/test/internal-error', async () => {
      throw new Error('Something unexpected happened');
    });

    app.get('/test/app-error', async () => {
      throw new AppError('CUSTOM_CODE', 'Custom error', 422);
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 400 with correct shape for ValidationError', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/validation-error',
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(body.error).toHaveProperty('message', 'Name is required');
    expect(body.error).toHaveProperty('timestamp');
    expect(Date.parse(body.error.timestamp)).not.toBeNaN();
  });

  it('should return 404 with correct shape for NotFoundError', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/not-found-error',
    });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(body.error).toHaveProperty('message', 'Resource not found');
    expect(body.error).toHaveProperty('timestamp');
  });

  it('should return 500 with INTERNAL_ERROR for unknown errors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/internal-error',
    });

    expect(response.statusCode).toBe(500);

    const body = response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'INTERNAL_ERROR');
    expect(body.error).toHaveProperty('message', 'Internal server error');
    expect(body.error).toHaveProperty('timestamp');
    // Must NOT leak internal error details
    expect(body.error.message).not.toContain('Something unexpected');
  });

  it('should respect custom statusCode from AppError subclasses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/app-error',
    });

    expect(response.statusCode).toBe(422);

    const body = response.json();
    expect(body.error.code).toBe('CUSTOM_CODE');
    expect(body.error.message).toBe('Custom error');
  });

  it('should always include error.timestamp as ISO-8601', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/validation-error',
    });

    const body = response.json();
    const timestamp = body.error.timestamp;

    // ISO 8601 format check
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should return JSON content type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/internal-error',
    });

    expect(response.headers['content-type']).toContain('application/json');
  });
});
