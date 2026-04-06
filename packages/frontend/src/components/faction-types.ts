/**
 * Data types consumed by the FactionMapPanel.
 * Represents faction graph data extracted from simulation reports.
 */

/** Faction stance determines node color */
export type FactionStance = 'escalate' | 'de_escalate' | 'uncertain' | 'neutral';

/** Stance-to-color mapping per PRD spec */
export const STANCE_COLORS: Record<FactionStance, string> = {
  escalate: '#e05252',
  de_escalate: '#4a90d9',
  uncertain: '#d4a843',
  neutral: '#888',
};

/** A faction node in the force-directed graph */
export interface FactionNode {
  id: string;
  name: string;
  memberCount: number;
  stance: FactionStance;
  keyAgents: string[];
}

/** An influence edge between two factions */
export interface FactionEdge {
  source: string;
  target: string;
  /** Weight between 0 and 1, mapped to stroke width 1-4px */
  weight: number;
}

/** Complete faction graph data for the panel */
export interface FactionGraphData {
  nodes: FactionNode[];
  edges: FactionEdge[];
}
