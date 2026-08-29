# Launch checklist

Run this checklist against the exact environment that will host the gateway.

## Application checks

- [ ] `DATABASE_URL` points to PostgreSQL 16 with the `vector` extension enabled.
- [ ] `REDIS_URL` points to the gateway Redis instance.
- [ ] `MIROFISH_API_URL` points to a reachable MiroFish backend.
- [ ] `NOTIFICATION_HUB_ENABLED` is false, or both Hub URL and API key are set.
- [ ] `SELF_REGISTRATION_ENABLED` is false after the first tenant is created.
- [ ] `DEMO_MODE` is false for a live frontend.
- [ ] Migrations finish successfully before the application starts.
- [ ] `GET /health/ready` reports healthy PostgreSQL, Redis, and MiroFish.

## Verification checks

Run `npm test`, `npm run test:e2e`, `npx tsc --noEmit`, `npm run build`, the frontend test/build commands, and `docker build -t swarm-gateway:verification .`. Run one small real simulation with worker concurrency set to one. Confirm that the resulting database rows include:

- a completed simulation with MiroFish project and simulation IDs;
- mirrored graph nodes and edges;
- agent profiles with an available structured or inferred stance;
- embedded agent episodes that can be found by semantic search;
- a report and at least one parsed prediction when the report contains predictions.

When the Notification Hub is enabled, send a completed simulation event through the live Hub and record its receipt time. The target is under 500 ms from the gateway publish call to the Hub's HTTP response.

## Recorded local verification — 2026-08-28

- Backend regression: 52 test files and 518 tests passed.
- Frontend regression/build: 31 test files and 376 tests passed; 712 production modules built.
- Static/schema gates: TypeScript build, `npx tsc --noEmit`, and Drizzle schema checks passed.
- Real pipeline: a current WorldMonitor package was ingested, processed by the real MiroFish service, and completed with 8 mirrored graph nodes, 9 edges, 30 embedded episodes, 2 profiles, a 3,904-character report, and 3 predictions.
- Latest README capture: the locally available package `live-worker-1787926262176` (generated `2026-08-28T12:17:37.196Z`) completed through the real gateway orchestrator from `15:15:35Z` to `15:23:14Z` with one agent and one round. PostgreSQL contains 12 mirrored graph nodes, 12 graph edges, 37 agent episodes, 2 profiles, an 8,366-character report, and 4 parsed predictions.
- The live frontend was verified against that completed simulation and rendered the Strait of Hormuz theater, prediction timeline, and four-prediction intelligence brief. The capture is stored at [`docs/live-local-capture-2026-08-28.png`](live-local-capture-2026-08-28.png).
- The upstream MiroFish report contained mixed English/Chinese natural-language output despite the English request. The frontend preserves and renders the returned content; it does not represent a translation or an independent forecast validation.
- Container verification: the Node 22 Bookworm production image built successfully, ran as `appuser`, and reported healthy PostgreSQL, Redis, and MiroFish readiness.
- Notification Hub: five real `simulation.completed` deliveries completed under the 500 ms response target.

The local WorldMonitor container is currently marked unhealthy because its optional AIS relay has no stream credential; the simulation-package Redis path and web service are reachable. External launch actions remain intentionally operator-gated below.

## External launch actions

The following actions require explicit operator authorization and are not
performed by repository verification: configuring UptimeRobot, publishing
GHCR images, deploying to Hetzner, configuring DNS/TLS, and publishing the
launch drafts in `docs/LAUNCH_CONTENT.md`. The gateway's `/health` endpoint and
the production container healthcheck are verified locally so those actions can
be completed safely later.

## Rollback

Pause the gateway worker, keep PostgreSQL and Redis data intact, and restore the previous application image. Do not remove volumes while investigating a failed release. Re-run the health checks before resuming the worker.
