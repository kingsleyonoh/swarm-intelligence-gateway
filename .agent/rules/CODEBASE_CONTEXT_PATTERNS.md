# Swarm Intelligence Gateway — Codebase Context: Architecture Patterns

> Split from `CODEBASE_CONTEXT.md`. Also see: `CODEBASE_CONTEXT_SCHEMA.md`

## Key Patterns & Conventions

- File naming: `kebab-case.ts` for source files
- Import conventions: standard lib → third-party → local, blank line between groups
- Error handling: custom error classes in `src/shared/errors.ts`, global Fastify error handler
- Logging: Pino JSON structured logging via `src/shared/logger.ts`
- Status tracking: simulation status machine (pending → queued → graph_building → simulating → reporting → completed | failed | cancelled)
- Pagination: cursor-based (`?cursor=<id>&limit=20`, default 20, max 100)
- Error format: `{ error: { code, message, timestamp } }`
- Ecosystem events: standard envelope `{ event_type, source: "swarm-gateway", tenant_id, timestamp, payload }`

## Architecture Patterns

### Error Response Format

All API errors MUST follow this shape. Implemented in `src/api/middleware/error-handler.ts`.

```typescript
// Response shape for ALL error responses:
{
  error: {
    code: string,       // Machine-readable: VALIDATION_ERROR, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, CONFLICT, INTERNAL_ERROR
    message: string,    // Human-readable explanation
    timestamp: string   // ISO-8601 timestamp
  }
}

// HTTP status mapping:
// VALIDATION_ERROR   → 400
// UNAUTHORIZED       → 401
// FORBIDDEN          → 403
// NOT_FOUND          → 404
// CONFLICT           → 409
// INTERNAL_ERROR     → 500
```

### Request-Scoped Caching (Auth Tenant Resolution)

Expensive lookups (tenant resolution from API key, config values) run ONCE per request via Fastify request decorators. Never call the same lookup twice in the same request lifecycle.

```typescript
// Pattern: Decorate request with resolved tenant in auth middleware
// src/api/middleware/auth.ts

// 1. Declare the decorator type on Fastify instance
fastify.decorateRequest('tenant', null);

// 2. Resolve tenant once in preHandler hook
fastify.addHook('preHandler', async (request, reply) => {
  if (request.tenant) return; // Already resolved (e.g., nested hooks)
  const apiKey = request.headers['x-api-key'] as string;
  if (!apiKey) throw new UnauthorizedError('Missing X-API-Key header');

  const hash = sha256(apiKey);
  const tenant = await db.select().from(tenants).where(eq(tenants.apiKeyHash, hash)).limit(1);
  if (!tenant[0] || !tenant[0].isActive) throw new UnauthorizedError('Invalid API key');

  request.tenant = tenant[0]; // Cached for this request's lifetime
});

// 3. Route handlers access request.tenant directly — no re-lookup
fastify.get('/api/scenarios', async (request) => {
  const results = await db.select().from(scenarios)
    .where(eq(scenarios.tenantId, request.tenant.id));
  return results;
});
```

### Data Fetching via Drizzle

Every query MUST include tenant_id scoping. Use cursor-based pagination (never offset).

```typescript
// Tenant-scoped query (MANDATORY for all data access):
const results = await db.select()
  .from(scenarios)
  .where(eq(scenarios.tenantId, tenant.id));

// Cursor-based pagination pattern:
// Query params: ?cursor=<lastId>&limit=20 (default 20, max 100)
const limit = Math.min(parsed.limit ?? 20, 100);
const query = db.select()
  .from(simulations)
  .where(and(
    eq(simulations.tenantId, tenant.id),
    cursor ? gt(simulations.id, cursor) : undefined,
  ))
  .orderBy(asc(simulations.id))
  .limit(limit + 1); // Fetch one extra to detect "has more"

const rows = await query;
const hasMore = rows.length > limit;
const data = hasMore ? rows.slice(0, limit) : rows;
const nextCursor = hasMore ? data[data.length - 1].id : null;
// Return: { data, cursor: nextCursor }
```

### API Key Auth Guard

Tenant authentication via API key hashing. Applied as a Fastify preHandler hook on protected routes.

```typescript
// Flow: X-API-Key header → SHA-256 hash → lookup in tenants table → attach to request
// File: src/api/middleware/auth.ts

// Hash function: crypto.createHash('sha256').update(apiKey).digest('hex')
// The plaintext API key is NEVER stored — only the hash.
// Registration endpoint returns the plaintext key ONCE, then discards it.

// Protected route registration:
fastify.register(async (app) => {
  app.addHook('preHandler', authMiddleware); // All routes in this scope require auth
  app.register(scenarioRoutes, { prefix: '/api/scenarios' });
  app.register(simulationRoutes, { prefix: '/api/simulations' });
  app.register(predictionRoutes, { prefix: '/api/predictions' });
});

// Public routes (no auth):
// POST /api/tenants/register
// GET  /health, /health/db, /health/ready
```

### BullMQ Job Patterns

Queue definitions and worker patterns for background processing.

```typescript
// Queue names (defined in src/shared/queue.ts):
// - 'run-simulation'       — on-demand, triggered by scenario ingestion
// - 'poll-worldmonitor'    — not a BullMQ queue; uses node-cron directly

// Job options for run-simulation:
{
  attempts: 2,
  backoff: { type: 'exponential', delay: 60000 }, // 1min, then 5min
  removeOnComplete: { count: 100 },  // Keep last 100 completed jobs
  removeOnFail: { count: 50 },       // Keep last 50 failed jobs
}

// Worker pattern (src/jobs/run-simulation.ts):
const worker = new Worker('run-simulation', async (job) => {
  const { scenarioId, tenantId } = job.data;
  await orchestrateSimulation(scenarioId, tenantId);
}, {
  connection: redisConnection,
  concurrency: 1,  // Resource-intensive — one at a time
});

// Graceful shutdown (src/index.ts):
process.on('SIGTERM', async () => {
  await worker.close();     // Finish current job, stop accepting new ones
  await queue.close();      // Close queue connection
  await redis.quit();       // Close Redis connection
  await db.end();           // Close DB pool
  process.exit(0);
});

// Cron jobs (src/jobs/poll-worldmonitor.ts, src/jobs/cleanup.ts):
// Use node-cron, NOT BullMQ repeatable jobs
// poll-worldmonitor: '0 * * * *'  (every 60 min)
// cleanup:          '0 3 * * *'   (daily 03:00 UTC)
// Concurrency guard: use a mutex flag to prevent overlapping cron runs
```

### Fastify Test Pattern (API Integration Tests)

Use Fastify's built-in `inject()` for API testing against real local services.

```typescript
// tests/api/example.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/api/server.js';

describe('GET /health', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = await buildApp();  // Returns configured Fastify instance
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

## Deployment Notes

- **Region co-location is mandatory.** The Hetzner VPS (CX33) must be provisioned in the same region as any managed database. Cross-region latency adds 50-100ms per query and compounds across the pipeline.
- If using **Supabase** for managed PostgreSQL, select the EU region closest to the Hetzner datacenter (e.g., if Hetzner is `fsn1` / Falkenstein, use Supabase `eu-central-1` / Frankfurt).
- The **production Docker Compose** (`docker-compose.prod.yml`) runs all services on a single host, so there is no cross-region latency between the app, PostgreSQL, and Redis containers.
- For local development, `docker-compose.yml` runs PostgreSQL (pgvector/pgvector:pg16) on port 5432 and Redis (redis:7-alpine) on port 6379. Start with `docker compose up -d`.
