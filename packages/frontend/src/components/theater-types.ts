/**
 * Data types consumed by the SwarmTheaterPanel.
 * These represent the transformed API response for theater card rendering.
 */

/** Faction split segment for the horizontal faction bar */
export interface FactionSplitSegment {
  stance: 'escalate' | 'de_escalate' | 'uncertain' | 'neutral';
  label: string;
  percentage: number;
}

/** Agent debate post displayed in the expanded feed */
export interface AgentDebatePost {
  agentId: string;
  username: string;
  faction: string;
  stanceColor: string;
  content: string;
  timestamp: string;
}

/** Theater domain categories for filtering */
export type TheaterDomain =
  | 'conflict'
  | 'market'
  | 'supply_chain'
  | 'political'
  | 'military'
  | 'cyber';

/** All domain values plus 'all' for filter buttons */
export const THEATER_DOMAINS: readonly ('all' | TheaterDomain)[] = [
  'all',
  'conflict',
  'market',
  'supply_chain',
  'political',
  'military',
  'cyber',
] as const;

/** Data for a single theater card */
export interface TheaterCardData {
  id: string;
  theater: string;
  domain: TheaterDomain;
  agentCount: number;
  currentRound: number;
  totalRounds: number;
  topPrediction: string;
  confidence: number;
  factionSplit: FactionSplitSegment[];
  agentDebate: AgentDebatePost[];
}
