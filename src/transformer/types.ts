/**
 * Transformer module types.
 *
 * These types represent the output of the data transformation pipeline
 * that converts WorldMonitor SimPackages into MiroFish-compatible inputs.
 */

/** Seed document containing assembled Markdown for MiroFish ingestion. */
export interface SeedDocument {
  markdown: string;
}

/** Ontology hints extracted from WorldMonitor entities for graph construction. */
export interface OntologyHints {
  entityTypes: string[];
  edgeTypes: string[];
}

/**
 * A single agent profile for OASIS simulation.
 *
 * Entity-derived agents have entityClass and stance populated.
 * Filler "citizen" agents have generic values.
 */
export interface AgentProfile {
  userId: number;
  username: string;
  name: string;
  persona: string;
  entityClass: string;
  stance: string;
  influenceWeight: number;
}

/** Complete transformer output for a single scenario. */
export interface TransformerOutput {
  seedDocument: SeedDocument;
  ontologyHints: OntologyHints;
  agentProfiles: AgentProfile[];
  csv: string;
}
