# Swarm Intelligence Gateway — Codebase Context

> Last updated: 2026-04-07
> Template synced: 2026-04-07

> Split: `CODEBASE_CONTEXT_SCHEMA.md` (schema) | `CODEBASE_CONTEXT_PATTERNS.md` (patterns)

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

## Git Commit Scopes

| Scope | Area |
|-------|------|
| `poller` | WorldMonitor polling (`src/worldmonitor/`) |
| `transformer` | Data transformation (`src/transformer/`) |
| `mirofish` | MiroFish orchestration (`src/mirofish/`) |
| `memory` | Custom graph store (`src/memory/`) |
| `api` | API routes + middleware (`src/api/`) |
| `jobs` | Background jobs + queue (`src/jobs/`) |
| `db` | Schema, migrations (`src/db/`) |
| `shared` | Shared utilities (`src/shared/`) |
| `config` | Configuration (`src/config/`) |
| `auth` | Tenant auth middleware |
| `frontend` | Swarm variant UI (`packages/frontend/`) |
| `deploy` | Docker, CI/CD, deployment |
| `workflows` | AI workflow system |

## Gotchas & Lessons Learned

> Discovered during implementation. Added automatically by `/implement-next` Step 9.3.

| Date | Area | Gotcha | Discovered In |
|------|------|--------|---------------|
| 2026-04-04 | deploy | Hetzner VPS must be co-located with DB region to avoid 50-100ms per-query latency penalty | Batch 001 setup |
| 2026-04-05 | Zod v4 | `.transform().pipe().default()` doesn't run transform on default value — use `z.preprocess()` | Phase 1 env validation |
| 2026-04-05 | Windows | CRLF regex greediness: `\s*(.*)` swallows newlines — use `^…$` with `m` flag, `[ \t]` for whitespace | Phase 2 prediction parser |
| 2026-04-05 | ioredis | Default import fails in strict ESM — use `import { Redis } from 'ioredis'` | Phase 1 Redis setup |
| 2026-04-05 | Node 22 | ESM import hoisting evaluates env.ts before dotenv — use `--env-file=.env.local` flag | Phase 2 smoke test |
| 2026-04-06 | Docker | CRLF in shell scripts breaks Docker builds on Windows — `sed -i 's/\r$//'` before building | Phase 6 WorldMonitor setup |
| 2026-04-06 | Docker | Port merge: docker-compose.override.yml ports MERGE with base (use `!override` to replace) | Phase 6 port mapping |
| 2026-04-06 | Ports | 5 Redis instances on different ports: 6379 (webhook-engine), 6380 (workflow-engine), 6381 (client-portal), 6382 (worldmonitor), 6383 (swarm-gateway) | Phase 6 infrastructure |
| 2026-04-06 | MiroFish | ALL responses wrapped in `{ data: {...}, success: bool }` — never read fields from top level | Phase 6 E2E testing |
| 2026-04-06 | MiroFish | Ontology generation is SYNCHRONOUS (no polling needed) — returns after LLM finishes | Phase 6 E2E run 3 |
| 2026-04-06 | MiroFish | Graph build is ASYNC — returns task_id, poll via GET /api/graph/task/:taskId | Phase 6 E2E run 4 |
| 2026-04-06 | MiroFish | Simulation lifecycle is THREE steps: create → prepare (async) → start | Phase 6 E2E run 7 |
| 2026-04-07 | MiroFish | Simulation completion uses `runner_status: "completed"`, NOT `status` | Phase 6 E2E run 8 |
| 2026-04-07 | MiroFish | Report generation must be EXPLICITLY triggered (POST /report/generate) before fetching | Phase 6 E2E run 8 |
| 2026-04-07 | MiroFish | MiroFish auto-configures round count (72 rounds instead of requested 1) — 10 agents took ~30min | Phase 6 E2E run 8 |
| 2026-04-06 | MiroFish | 4.3GB Docker image — fails on slow connections, no partial resume. Source install needs Python <3.12 | Phase 6 MiroFish setup |
| 2026-04-06 | WorldMonitor | Seeders use Redis lock acquisition that fails with local REST proxy — 72/95 seeders skip | Phase 6 seeder run |
| 2026-04-06 | BullMQ | Simulation route creates record (pending) then orchestrator tried to create again → ConflictError | Phase 6 E2E run 2 |
| 2026-04-07 | WorldMonitor | Seeders use `localhost` which resolves to IPv6 (::1) on Windows — Redis REST proxy only listens on IPv4 (127.0.0.1). Use explicit `127.0.0.1` | Phase 6 seeder debugging |
| 2026-04-07 | WorldMonitor | `_isDirectRun` check fails when path contains spaces — `import.meta.url` URL-encodes spaces but `process.argv[1]` doesn't | Phase 6 forecast seeder |
| 2026-04-07 | WorldMonitor | Forecast seeder hardcodes `providerOrder=groq,openrouter` — ignores `LLM_API_URL`/`LLM_API_KEY` env vars | Phase 6 DeepSeek attempt |
| 2026-04-07 | Docker | OOM kill (exit code -9) when too many containers run simultaneously — stop non-essential containers before heavy simulations | Phase 6 English simulation |
| 2026-04-07 | Vite | Dev proxy uses `localhost` which resolves to IPv6 on Windows — use `127.0.0.1` in vite.config.ts proxy target | Phase 6 frontend wiring |
| 2026-04-07 | Frontend | DataBridge polls simulations (30s) and predictions (60s) separately — predictions cache empty on first simulation render, causing missing theater names | Phase 6 frontend wiring |

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
