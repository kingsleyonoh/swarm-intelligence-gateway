import type { FastifyInstance, FastifyError } from 'fastify';

import { AppError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

/**
 * Register the global error handler on the Fastify instance.
 *
 * Catches all thrown errors and serializes them into the standard
 * `{ error: { code, message, timestamp } }` envelope.
 *
 * - AppError subclasses → use their statusCode + toResponse()
 * - Fastify validation errors → 400 VALIDATION_ERROR
 * - Unknown errors → 500 INTERNAL_ERROR (no detail leak)
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    // AppError and subclasses (ValidationError, NotFoundError, etc.)
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toResponse());
    }

    // Fastify schema validation errors (has .validation property)
    const fastifyError = error as FastifyError;
    if (fastifyError.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: fastifyError.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Unknown / unexpected errors — log full error, return safe response
    logger.error(error, 'Unhandled error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
      },
    });
  });
}
