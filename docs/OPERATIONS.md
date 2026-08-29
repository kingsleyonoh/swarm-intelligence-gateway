# Operations

## Services

The gateway needs PostgreSQL 16 with pgvector, Redis 7, and a reachable MiroFish backend. WorldMonitor publishes its latest simulation package to its own Redis instance. The gateway poller accepts both a direct package and the current `{ runId, pkgKey, ... }` pointer; pointer deployments additionally need the WorldMonitor R2 account, bucket, and API token environment variables.

The worker uses concurrency one. Increase it only after measuring memory use with the MiroFish model and the embedding model loaded.

## Normal startup

```powershell
docker compose up -d postgres redis
npm run db:migrate
npm run start
```

Use the local override files supplied with the sibling checkouts when running WorldMonitor and MiroFish together with the gateway. Check container health before starting the gateway worker.

## Failure handling

MiroFish connection failures are retried for connection-level errors. A failed simulation is marked `failed` with its error message. WorldMonitor Redis failures are retried by the next poll cycle; after three consecutive failures for a tenant, the gateway emits `worldmonitor.unavailable` when the Notification Hub is enabled.

Notification delivery is best effort. A Hub failure is logged and does not change a completed simulation back to failed. Inspect the structured log fields `simulationId`, `tenantId`, `eventType`, and `error` when tracing an incident.

## Data retention

`DATA_RETENTION_DAYS` controls the daily cleanup job. Cleanup deletes predictions, graph edges, graph nodes, agent episodes, profiles, and simulations older than the cutoff. Scenario metadata remains available for source history.

## Backups and secrets

Back up PostgreSQL before migrations and retain Redis only as a recoverable queue/cache. Store API keys outside the repository and rotate them through the tenant management process. Never paste `.env`, Docker inspect output, or provider credentials into issue reports.
