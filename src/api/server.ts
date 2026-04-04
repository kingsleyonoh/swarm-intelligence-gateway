import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

/**
 * Build and configure the Fastify application instance.
 *
 * Uses the factory pattern so tests can create isolated app instances
 * via `buildApp()` and use Fastify's `inject()` method.
 */
export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? true,
    ...opts,
  });

  // --- Plugins will be registered here ---

  // --- Routes will be registered here ---

  return app;
}
