import {
  boolean,
  customType,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ── Custom pgvector type ────────────────────────────────────────────────

export const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return 'vector(384)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown) {
    return String(value)
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(Number);
  },
});

// ── Tables ──────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  apiKeyHash: varchar('api_key_hash', { length: 255 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    worldmonitorRunId: varchar('worldmonitor_run_id', { length: 255 }),
    title: varchar('title', { length: 500 }).notNull(),
    theaters: jsonb('theaters').notNull(),
    entities: jsonb('entities').notNull(),
    eventSeeds: jsonb('event_seeds').notNull(),
    constraints: jsonb('constraints').notNull(),
    simulationRequirement: text('simulation_requirement').notNull(),
    source: varchar('source', { length: 50 }).notNull().default('poller'),
    rawPackage: jsonb('raw_package'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_scenarios_tenant_run').on(table.tenantId, table.worldmonitorRunId),
    index('idx_scenarios_tenant').on(table.tenantId, table.createdAt),
  ],
);

export const simulations = pgTable(
  'simulations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    scenarioId: uuid('scenario_id')
      .notNull()
      .references(() => scenarios.id),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    mirofishProjectId: varchar('mirofish_project_id', { length: 255 }),
    mirofishSimId: varchar('mirofish_sim_id', { length: 255 }),
    agentCount: integer('agent_count').notNull().default(4096),
    roundCount: integer('round_count').notNull().default(5),
    llmProvider: varchar('llm_provider', { length: 100 }).notNull().default('deepseek'),
    seedDocument: text('seed_document'),
    report: text('report'),
    errorMessage: text('error_message'),
    costEstimateUsd: decimal('cost_estimate_usd', { precision: 10, scale: 4 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_simulations_tenant').on(table.tenantId, table.createdAt),
    index('idx_simulations_status').on(table.tenantId, table.status),
  ],
);

export const graphNodes = pgTable(
  'graph_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => simulations.id),
    entityId: varchar('entity_id', { length: 255 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    name: varchar('name', { length: 500 }).notNull(),
    properties: jsonb('properties').notNull().default({}),
    embedding: vector('embedding'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_graph_nodes_sim_entity').on(table.simulationId, table.entityId),
    index('idx_graph_nodes_tenant_sim').on(table.tenantId, table.simulationId),
    index('idx_graph_nodes_type').on(table.simulationId, table.entityType),
  ],
);

export const graphEdges = pgTable(
  'graph_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => simulations.id),
    sourceNodeId: uuid('source_node_id')
      .notNull()
      .references(() => graphNodes.id),
    targetNodeId: uuid('target_node_id')
      .notNull()
      .references(() => graphNodes.id),
    edgeType: varchar('edge_type', { length: 100 }).notNull(),
    properties: jsonb('properties').notNull().default({}),
    weight: decimal('weight', { precision: 5, scale: 4 }).default('1.0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_graph_edges_tenant_sim').on(table.tenantId, table.simulationId),
    index('idx_graph_edges_source').on(table.sourceNodeId),
    unique('uq_graph_edges_sim_relation').on(
      table.simulationId,
      table.sourceNodeId,
      table.targetNodeId,
      table.edgeType,
    ),
  ],
);

export const agentEpisodes = pgTable(
  'agent_episodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => simulations.id),
    agentId: integer('agent_id').notNull(),
    roundNumber: integer('round_number').notNull(),
    actionType: varchar('action_type', { length: 50 }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding'),
    sourceKey: varchar('source_key', { length: 512 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_episodes_tenant_sim').on(table.tenantId, table.simulationId),
    index('idx_episodes_agent').on(table.simulationId, table.agentId, table.roundNumber),
    unique('uq_agent_episodes_sim_source').on(table.simulationId, table.sourceKey),
  ],
);

export const agentProfiles = pgTable(
  'agent_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => simulations.id),
    agentId: integer('agent_id').notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    bio: text('bio'),
    persona: text('persona').notNull(),
    entityClass: varchar('entity_class', { length: 100 }),
    stance: varchar('stance', { length: 50 }),
    influenceWeight: decimal('influence_weight', { precision: 5, scale: 4 }).default('0.5'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_agent_profiles_sim_agent').on(table.simulationId, table.agentId),
    index('idx_profiles_sim').on(table.simulationId),
  ],
);

export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => simulations.id),
    theater: varchar('theater', { length: 255 }).notNull(),
    predictionType: varchar('prediction_type', { length: 100 }).notNull(),
    summary: text('summary').notNull(),
    confidence: decimal('confidence', { precision: 5, scale: 4 }).notNull(),
    timeHorizon: varchar('time_horizon', { length: 50 }).notNull(),
    supportingFactions: jsonb('supporting_factions'),
    dissentingFactions: jsonb('dissenting_factions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_predictions_tenant').on(table.tenantId, table.createdAt),
    index('idx_predictions_confidence').on(table.tenantId, table.confidence),
  ],
);
