# Launch content drafts

These are local, unpublished drafts. No external publication or deployment is
part of repository verification.

## Show HN

**Title:** Show HN: I connected WorldMonitor and MiroFish to explore future world events with swarm AI

WorldMonitor surfaces live signals; MiroFish turns a scenario into a social
simulation. Swarm Intelligence Gateway connects the two, persists the result in
PostgreSQL, and exposes predictions, agent profiles, action logs, and semantic
episode search through a tenant-scoped API.

The interesting engineering work was at the seam: WorldMonitor's package can
be a direct JSON payload or an R2 pointer, while MiroFish's real API requires a
multi-step graph, preparation, simulation, and report lifecycle. The gateway
keeps a PostgreSQL/pgvector memory store for its own data and a BullMQ worker
with concurrency one for safe local operation.

This is a self-hostable experiment rather than a claim that a simulation knows
the future. The dashboard shows confidence, disagreement, supporting factions,
and the underlying debate feed so the output can be inspected.

## Evidence boundary

The current evidence is local only: the latest locally available WorldMonitor
package was run through the real gateway and MiroFish services with PostgreSQL
and Redis. The repository README links to the captured Strait of Hormuz brief
and records the observed result. There is no hosted demo URL or public
deployment to promise yet. Natural-language output is provider-dependent and
may be mixed-language, so launch copy should describe this as an inspectable
simulation workflow rather than a guaranteed English forecast.

## Reddit angles

### r/aiagents

The agent-systems angle: a real event package becomes a scenario, MiroFish runs
the swarm, and the gateway stores the resulting profiles/actions/predictions as
queryable tenant data. The post should focus on orchestration and failure
boundaries.

### r/LocalLLaMA

The local-infrastructure angle: PostgreSQL + pgvector, Redis/BullMQ, local
embedding generation, and a self-hosted MiroFish service. The post should
include memory limits and the one-simulation worker setting.

### r/selfhosted

The operations angle: Docker Compose for PostgreSQL/Redis, a health/readiness
endpoint, migrations, structured errors, retention cleanup, and a documented
rollback path. The post should clearly list the upstream provider credentials
that MiroFish itself still requires.

## dev.to outline

**How I built a geopolitical prediction engine by connecting two open-source projects**

1. The problem: live monitoring and forward-looking analysis live in separate
   systems.
2. The bridge contract: normalize WorldMonitor's package and pointer formats.
3. The MiroFish lifecycle: create, prepare, start, poll, generate a report.
4. Durable memory: tenant-scoped PostgreSQL tables and pgvector episode search.
5. Reliability: BullMQ retries, concurrency one, health checks, and graceful
   shutdown.
6. Honest evaluation: inspect predictions and disagreement instead of treating
   simulation output as certainty.
7. What remains operational: configure upstream credentials, run the launch
   checklist, and publish only after explicit review.
