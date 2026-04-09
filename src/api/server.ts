import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registerErrorHandler } from './middleware/error-handler.js';
import { registerAuthDecorator } from './middleware/auth.js';
import { healthRoutes } from './routes/health.js';
import { tenantRoutes } from './routes/tenants.js';
import { simulationRoutes } from './routes/simulations.js';
import { simulationActionRoutes } from './routes/simulation-actions.js';
import { scenarioRoutes } from './routes/scenarios.js';
import { predictionRoutes } from './routes/predictions.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { quickLaunchRoutes } from './routes/quick-launch.js';
import { agentDataRoutes } from './routes/agent-data.js';

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
  // Note: register simulationActionRoutes BEFORE simulationRoutes so the
  // literal sub-paths (`/:id/report`, `/:id/cancel`) are matched before
  // the generic `/:id` handler.
  app.register(healthRoutes);
  app.register(intelligenceRoutes);
  app.register(tenantRoutes);
  app.register(quickLaunchRoutes);
  app.register(agentDataRoutes);
  app.register(simulationActionRoutes);
  app.register(simulationRoutes);
  app.register(scenarioRoutes);
  app.register(predictionRoutes);

  return app;
}
