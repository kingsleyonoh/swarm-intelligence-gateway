# Swarm Intelligence Gateway — Codebase Context

> Last updated: 2026-04-04
> Template synced: 2026-04-04

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.x |
| Framework | Fastify 5.x |
| Database | PostgreSQL 16 (Supabase managed) + pgvector |
| Cache / Queue | Redis 7 (Upstash) + BullMQ |
| ORM | Drizzle ORM |
| HTTP Client | undici |
| Scheduler | node-cron |
| Embeddings | @xenova/transformers (all-MiniLM-L6-v2, 384-dim) |
| Hosting | Docker on Hetzner VPS (CX33) |
| Frontend | Vanilla TypeScript (WorldMonitor fork) + globe.gl + D3.js + deck.gl |
| Demo Hosting | Vercel (free tier) |
| Package Manager | npm (workspaces) |
| Test Runner | Vitest |
| Build Tool | tsc (TypeScript compiler) |

## Project Structure

```
swarm-intelligence-gateway/
├── src/
│   ├── config/
│   │   ├── env.ts                 # Env var validation (zod)
│   │   └── constants.ts           # Default values, status enums
│   ├── shared/
│   │   ├── db.ts                  # Drizzle ORM connection + pool lifecycle
│   │   ├── redis.ts               # ioredis client lifecycle
│   │   ├── queue.ts               # BullMQ connection + queue definitions
│   │   ├── logger.ts              # Pino structured logger
│   │   ├── errors.ts              # Custom error classes
│   │   └── embeddings.ts          # @xenova/transformers embedding generation
│   ├── db/
│   │   ├── schema.ts              # Drizzle schema definitions (all tables)
│   │   └── migrations/            # SQL migration files
│   ├── worldmonitor/
│   │   ├── poller.ts              # Redis polling + scenario ingestion
│   │   ├── types.ts               # WorldMonitor SimPackage types
│   │   └── parser.ts              # Validate + parse simulation packages
│   ├── transformer/
│   │   ├── seed-document.ts       # SimPackage → Markdown seed doc
│   │   ├── agent-profiles.ts      # Entities → OASIS agent CSV
│   │   ├── ontology.ts            # Entities → ontology hints
│   │   └── types.ts               # Transformer input/output types
│   ├── mirofish/
│   │   ├── client.ts              # MiroFish Flask API HTTP client
│   │   ├── orchestrator.ts        # Full pipeline: graph → sim → report
│   │   └── types.ts               # MiroFish API types
│   ├── memory/
│   │   ├── graph-store.ts         # Custom graph CRUD (nodes, edges, episodes)
│   │   └── types.ts               # Graph data types
│   ├── api/
│   │   ├── server.ts              # Fastify app setup + plugin registration
│   │   ├── routes/
│   │   │   ├── tenants.ts         # /api/tenants/*
│   │   │   ├── scenarios.ts       # /api/scenarios/*
│   │   │   ├── simulations.ts     # /api/simulations/*
│   │   │   ├── predictions.ts     # /api/predictions/*
│   │   │   └── health.ts          # /health/*
│   │   └── middleware/
│   │       ├── auth.ts            # API key → tenant resolution
│   │       └── error-handler.ts   # Global error handler
│   ├── jobs/
│   │   ├── poll-worldmonitor.ts   # Cron job: poll + ingest
│   │   ├── run-simulation.ts      # BullMQ worker: orchestrate simulation
│   │   └── cleanup.ts            # Cron job: remove old data
│   └── index.ts                   # Entry point: start server + workers + cron
├── tests/
│   ├── worldmonitor/              # Poller + parser tests
│   ├── transformer/               # Seed doc + profile generation tests
│   ├── mirofish/                  # Orchestrator tests (mocked HTTP)
│   ├── memory/                    # Graph store tests (real DB)
│   ├── api/                       # API endpoint tests (real DB)
│   └── fixtures/
│       ├── worldmonitor/          # Sample simulation packages
│       └── mirofish/              # Sample API responses
├── packages/
│   └── frontend/                  # Fork of WorldMonitor with "swarm" variant
│       ├── src/
│       │   ├── components/        # SwarmTheaterPanel, FactionMapPanel, etc.
│       │   └── config/variants/   # swarm.ts variant config
│       └── package.json
├── docs/
├── .env.example
├── Dockerfile
├── docker-compose.yml             # Dev: app + PostgreSQL + Redis
├── docker-compose.prod.yml        # Prod: swarm.kingsleyonoh.com
├── drizzle.config.ts
├── package.json                   # Monorepo root (workspaces)
├── tsconfig.json
└── vitest.config.ts
```

**Dependency hierarchy:**
```
index.ts
├── api/server.ts
│   ├── routes/* → shared/db, shared/queue
│   └── middleware/* → shared/db
├── jobs/poll-worldmonitor.ts → worldmonitor/poller → shared/redis, shared/db
├── jobs/run-simulation.ts → mirofish/orchestrator → transformer/*, memory/*, shared/*
└── jobs/cleanup.ts → shared/db
```

## Key Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| WorldMonitor Poller | Poll Redis for simulation packages, ingest scenarios | `src/worldmonitor/poller.ts`, `parser.ts` |
| Data Transformer | Convert WorldMonitor packages → MiroFish inputs | `src/transformer/seed-document.ts`, `agent-profiles.ts`, `ontology.ts` |
| MiroFish Orchestrator | Drive full MiroFish pipeline (graph → sim → report) | `src/mirofish/client.ts`, `orchestrator.ts` |
| Custom Graph Store | PostgreSQL graph store replacing Zep Cloud (pgvector) | `src/memory/graph-store.ts` |
| API Layer | REST API for simulation management + prediction queries | `src/api/routes/*.ts` |
| Job Queue | BullMQ workers for long-running simulation orchestration | `src/jobs/run-simulation.ts` |
| Frontend (Phase 4) | WorldMonitor fork with swarm prediction panels | `packages/frontend/` |

## Database Schema

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `tenants` | Multi-tenant isolation | id (UUID), api_key_hash, is_active, settings (JSONB) |
| `scenarios` | WorldMonitor simulation packages | id, tenant_id FK, worldmonitor_run_id, theaters/entities/event_seeds/constraints (JSONB) |
| `simulations` | MiroFish simulation runs | id, tenant_id FK, scenario_id FK, status, seed_document, report, cost_estimate_usd |
| `graph_nodes` | Knowledge graph entities | id, simulation_id FK, entity_type, embedding VECTOR(384) |
| `graph_edges` | Entity relationships | id, simulation_id FK, source_node_id FK, target_node_id FK, edge_type, weight |
| `agent_episodes` | Per-agent memory during simulation | id, simulation_id FK, agent_id, round_number, action_type, embedding VECTOR(384) |
| `agent_profiles` | Generated OASIS agent profiles | id, simulation_id FK, agent_id, persona, entity_class, stance |
| `predictions` | Extracted predictions from reports | id, simulation_id FK, theater, prediction_type, confidence, time_horizon |

## External Integrations

| Service | Purpose | Auth Method |
|---------|---------|------------|
| WorldMonitor (self-hosted) | Source of simulation packages via Redis | Redis connection string (UPSTASH_REDIS_URL) |
| MiroFish (self-hosted) | Swarm simulation engine via Flask API | None (localhost) or API key |
| DeepSeek API | LLM inference for MiroFish | Bearer token (DEEPSEEK_API_KEY) |
| Notification Hub (ecosystem) | Event routing for high-confidence predictions | API key (NOTIFICATION_HUB_API_KEY) |
| Webhook Engine (ecosystem) | External event triggers for simulations | Shared secret (WEBHOOK_SECRET) |
| Sentry | Error tracking | DSN (SENTRY_DSN) |
| UptimeRobot | Uptime monitoring on /health | External service |

## Environment Variables

| Variable | Purpose | Source |
|----------|---------|--------|
| `DATABASE_URL` | PostgreSQL connection (with pgvector) | Supabase / local Docker |
| `REDIS_URL` | App Redis (queue + cache) | Upstash / local Docker |
| `WORLDMONITOR_REDIS_URL` | WorldMonitor's Upstash Redis | Upstash |
| `WORLDMONITOR_REDIS_TOKEN` | Upstash REST token | Upstash |
| `MIROFISH_API_URL` | MiroFish Flask API base URL | Self-hosted |
| `DEEPSEEK_API_KEY` | DeepSeek LLM API key | DeepSeek |
| `PORT` | API server port (default 3000) | Config |
| `NODE_ENV` | Environment (development/production) | Config |
| `LOG_LEVEL` | Pino log level | Config |
| `POLL_INTERVAL_MINUTES` | WorldMonitor poll frequency (default 60) | Config |
| `DEFAULT_AGENT_COUNT` | Agents per simulation (default 4096) | Config |
| `DEFAULT_ROUND_COUNT` | Simulation rounds (default 5) | Config |
| `SELF_REGISTRATION_ENABLED` | Allow tenant self-registration | Config |
| `DATA_RETENTION_DAYS` | Days before cleanup (default 90) | Config |
| `NOTIFICATION_HUB_ENABLED` | Enable Hub integration (default false) | Feature flag |
| `NOTIFICATION_HUB_URL` | Hub API base URL | Ecosystem |
| `NOTIFICATION_HUB_API_KEY` | Hub API key | Ecosystem |
| `WEBHOOK_SECRET` | Webhook Engine payload verification | Ecosystem |
| `SENTRY_DSN` | Sentry error tracking | Sentry |
| `DEMO_MODE` | Enable demo security protections | Config |

## Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Run tests | `npm test` (Vitest) |
| Run tests (watch) | `npm run test:watch` |
| Lint/check | `npx tsc --noEmit` |
| Build | `npm run build` |
| Migrate DB | `npm run db:migrate` |
| Generate migration | `npm run db:generate` |
| Seed default tenant | `npm run setup` |
| Start (production) | `npm start` |

## Tenant Model

- **Isolation strategy:** API key auth via `X-API-Key` header → hash → tenant lookup
- **Tenant table:** `tenants` (id UUID, api_key_hash, is_active, settings JSONB)
- **Tenant middleware:** `src/api/middleware/auth.ts` — resolves tenant from API key, attaches to request
- **Scoping:** Every query includes `WHERE tenant_id = ?` — enforced at route handler level via Drizzle

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

## Gotchas & Lessons Learned

> Discovered during implementation. Added automatically by `/implement-next` Step 9.3.

| Date | Area | Gotcha | Discovered In |
|------|------|--------|---------------|
| 2026-04-04 | deploy | Hetzner VPS must be co-located with DB region to avoid 50-100ms per-query latency penalty | Batch 001 setup |

## Shared Foundation (MUST READ before any implementation)

| Category | File(s) | What it establishes |
|----------|---------|-------------------|
| DB client | `src/shared/db.ts` | Drizzle ORM connection pool, graceful shutdown |
| Redis client | `src/shared/redis.ts` | ioredis lifecycle, shared between BullMQ/poller/cache |
| Job queue | `src/shared/queue.ts` | BullMQ connection, queue definitions |
| Logger | `src/shared/logger.ts` | Pino structured logging, request context |
| Error handling | `src/shared/errors.ts` | Custom error classes, error codes |
| Embeddings | `src/shared/embeddings.ts` | @xenova/transformers embedding generation (384-dim) |
| Config | `src/config/env.ts` | Zod env var validation, typed config |
| Constants | `src/config/constants.ts` | Status enums, default values |
| Auth middleware | `src/api/middleware/auth.ts` | API key → tenant resolution |
| Error handler | `src/api/middleware/error-handler.ts` | Global Fastify error handler |
| DB schema | `src/db/schema.ts` | All Drizzle table definitions |

## Deep References

| Topic | Where to look |
|-------|--------------|
| WorldMonitor polling | `src/worldmonitor/` |
| Data transformation | `src/transformer/` |
| MiroFish orchestration | `src/mirofish/` |
| Graph store / memory | `src/memory/` |
| API routes | `src/api/routes/` |
| Auth middleware | `src/api/middleware/` |
| Background jobs | `src/jobs/` |
| Database schema | `src/db/schema.ts` |
| Test patterns | `tests/` |
| Frontend (swarm variant) | `packages/frontend/` |
