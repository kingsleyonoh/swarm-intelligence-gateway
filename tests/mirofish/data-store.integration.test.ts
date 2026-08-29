import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { db } from '../../src/shared/db.js';
import { agentEpisodes, agentProfiles, scenarios, simulations } from '../../src/db/schema/tables.js';
import { storeActionLogs, storeProfiles } from '../../src/mirofish/data-store.js';
import { createTestTenant, cleanupTestTenant } from '../helpers/test-app.js';

describe('MiroFish data storage against PostgreSQL', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  let scenarioId: string;
  let simulationId: string;

  beforeAll(async () => {
    tenant = await createTestTenant('MiroFish Data Store Integration');
    const [scenario] = await db.insert(scenarios).values({
      tenantId: tenant.id,
      title: 'Data store integration',
      theaters: [],
      entities: [],
      eventSeeds: [],
      constraints: { hard: [], soft: [] },
      simulationRequirement: 'Test data persistence',
      source: 'manual',
    }).returning({ id: scenarios.id });
    scenarioId = scenario.id;
    const [simulation] = await db.insert(simulations).values({
      tenantId: tenant.id,
      scenarioId,
      status: 'completed',
      agentCount: 1,
      roundCount: 1,
      llmProvider: 'test',
    }).returning({ id: simulations.id });
    simulationId = simulation.id;
  });

  afterAll(async () => {
    await db.delete(agentEpisodes).where(eq(agentEpisodes.simulationId, simulationId));
    await db.delete(agentProfiles).where(eq(agentProfiles.simulationId, simulationId));
    await db.delete(simulations).where(eq(simulations.id, simulationId));
    await db.delete(scenarios).where(eq(scenarios.id, scenarioId));
    await cleanupTestTenant(tenant.apiKeyHash);
  });

  it('stores embedded, idempotent agent episodes from MiroFish actions', async () => {
    const action = {
      agent_id: 11,
      round: 2,
      platform: 'twitter',
      action_type: 'CREATE_POST',
      content: 'Shipping insurance is repricing risk',
      timestamp: '2026-08-28T10:00:00Z',
      metadata: { success: true },
    };

    await storeActionLogs(simulationId, tenant.id, [action]);
    await storeActionLogs(simulationId, tenant.id, [action]);

    const rows = await db.select().from(agentEpisodes).where(and(
      eq(agentEpisodes.tenantId, tenant.id),
      eq(agentEpisodes.simulationId, simulationId),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].embedding).toHaveLength(384);
    expect(rows[0].roundNumber).toBe(2);
    expect(rows[0].metadata).toMatchObject({ success: true, platform: 'twitter' });
  });

  it('upserts profiles and keeps structured or inferred stance data', async () => {
    await storeProfiles(simulationId, tenant.id, [{
      user_id: 4,
      username: 'hawk',
      name: 'Hawk',
      bio: 'Security analyst',
      persona: 'A hawkish observer who supports escalation when deterrence fails',
      profession: 'Analyst',
    }]);
    await storeProfiles(simulationId, tenant.id, [{
      user_id: 4,
      username: 'hawk_updated',
      name: 'Hawk Updated',
      bio: 'Security analyst',
      persona: 'A diplomatic observer',
      profession: 'Analyst',
      stance: 'de_escalate',
    }]);

    const rows = await db.select().from(agentProfiles).where(and(
      eq(agentProfiles.tenantId, tenant.id),
      eq(agentProfiles.simulationId, simulationId),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe('hawk_updated');
    expect(rows[0].stance).toBe('de_escalate');
  });
});
