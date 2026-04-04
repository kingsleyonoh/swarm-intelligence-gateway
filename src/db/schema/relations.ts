import { relations } from 'drizzle-orm';

import {
  agentEpisodes,
  agentProfiles,
  graphEdges,
  graphNodes,
  predictions,
  scenarios,
  simulations,
  tenants,
} from './tables.js';

// ── Relations ───────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  scenarios: many(scenarios),
  simulations: many(simulations),
  predictions: many(predictions),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [scenarios.tenantId],
    references: [tenants.id],
  }),
  simulations: many(simulations),
}));

export const simulationsRelations = relations(simulations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [simulations.tenantId],
    references: [tenants.id],
  }),
  scenario: one(scenarios, {
    fields: [simulations.scenarioId],
    references: [scenarios.id],
  }),
  graphNodes: many(graphNodes),
  graphEdges: many(graphEdges),
  agentEpisodes: many(agentEpisodes),
  agentProfiles: many(agentProfiles),
  predictions: many(predictions),
}));

export const graphNodesRelations = relations(graphNodes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [graphNodes.tenantId],
    references: [tenants.id],
  }),
  simulation: one(simulations, {
    fields: [graphNodes.simulationId],
    references: [simulations.id],
  }),
  outgoingEdges: many(graphEdges, { relationName: 'sourceNode' }),
  incomingEdges: many(graphEdges, { relationName: 'targetNode' }),
}));

export const graphEdgesRelations = relations(graphEdges, ({ one }) => ({
  tenant: one(tenants, {
    fields: [graphEdges.tenantId],
    references: [tenants.id],
  }),
  simulation: one(simulations, {
    fields: [graphEdges.simulationId],
    references: [simulations.id],
  }),
  sourceNode: one(graphNodes, {
    fields: [graphEdges.sourceNodeId],
    references: [graphNodes.id],
    relationName: 'sourceNode',
  }),
  targetNode: one(graphNodes, {
    fields: [graphEdges.targetNodeId],
    references: [graphNodes.id],
    relationName: 'targetNode',
  }),
}));

export const agentEpisodesRelations = relations(agentEpisodes, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agentEpisodes.tenantId],
    references: [tenants.id],
  }),
  simulation: one(simulations, {
    fields: [agentEpisodes.simulationId],
    references: [simulations.id],
  }),
}));

export const agentProfilesRelations = relations(agentProfiles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agentProfiles.tenantId],
    references: [tenants.id],
  }),
  simulation: one(simulations, {
    fields: [agentProfiles.simulationId],
    references: [simulations.id],
  }),
}));

export const predictionsRelations = relations(predictions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [predictions.tenantId],
    references: [tenants.id],
  }),
  simulation: one(simulations, {
    fields: [predictions.simulationId],
    references: [simulations.id],
  }),
}));
