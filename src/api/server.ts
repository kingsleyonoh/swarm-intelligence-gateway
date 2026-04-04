import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registerErrorHandler } from './middleware/error-handler.js';
import { registerAuthDecorator } from './middleware/auth.js';
import { healthRoutes } from './routes/health.js';
import { tenantRoutes } from './routes/tenants.js';
import { simulationRoutes } from './routes/simulations.js';
import { scenarioRoutes } from './routes/scenarios.js';

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

  // --- Global middleware ---
  registerErrorHandler(app);
  registerAuthDecorator(app);

  // --- Routes ---
  app.register(healthRoutes);
  app.register(tenantRoutes);
  app.register(simulationRoutes);
  app.register(scenarioRoutes);

  return app;
}
