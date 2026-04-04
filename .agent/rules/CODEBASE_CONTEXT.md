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

## Gotchas & Lessons Learned

> Discovered during implementation. Added automatically by `/implement-next` Step 9.3.

| Date | Area | Gotcha | Discovered In |
|------|------|--------|---------------|
| | | | |

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
