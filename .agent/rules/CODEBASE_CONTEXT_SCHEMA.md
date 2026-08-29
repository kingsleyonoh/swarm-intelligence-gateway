# Swarm Intelligence Gateway — Codebase Context: Schema & Integrations

> Split from `CODEBASE_CONTEXT.md`. Also see: `CODEBASE_CONTEXT_PATTERNS.md`

## Key Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| WorldMonitor Poller | Poll Redis for simulation packages, ingest scenarios | `src/worldmonitor/poller.ts`, `parser.ts` |
| Data Transformer | Convert WorldMonitor packages → MiroFish inputs | `src/transformer/seed-document.ts`, `agent-profiles.ts`, `ontology.ts` |
| MiroFish Orchestrator | Drive full MiroFish pipeline (graph → sim → report) | `src/mirofish/client.ts`, `orchestrator.ts` |
| Custom Graph Store | PostgreSQL + pgvector system of record for gateway-owned graph memory and episode search | `src/memory/graph-store.ts` |
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
| Notification Hub (ecosystem) | Event routing for simulation lifecycle events | Bearer + `X-API-Key` (NOTIFICATION_HUB_API_KEY) |
| Webhook Engine (ecosystem) | External event triggers for simulations | Shared secret (WEBHOOK_SECRET) |
| Sentry | Error tracking | DSN (SENTRY_DSN) |
| UptimeRobot | Uptime monitoring on /health | External service |

## Tenant Model

- **Isolation strategy:** API key auth via `X-API-Key` header → hash → tenant lookup
- **Tenant table:** `tenants` (id UUID, api_key_hash, is_active, settings JSONB)
- **Tenant middleware:** `src/api/middleware/auth.ts` — resolves tenant from API key, attaches to request
- **Scoping:** Every query includes `WHERE tenant_id = ?` — enforced at route handler level via Drizzle
