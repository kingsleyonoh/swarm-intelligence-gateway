/**
 * Pre-built scenario templates for quick-launch simulations.
 */

import type { Theater, Entity, EventSeed, Constraints } from './types.js';

export interface ScenarioTemplate {
  id: string;
  label: string;
  category: 'military' | 'market' | 'cyber' | 'political';
  title: string;
  selectedTheaters: Theater[];
  entities: Entity[];
  eventSeeds: EventSeed[];
  constraints: Constraints;
  simulationRequirement: string;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'south-china-sea',
    label: 'South China Sea -- Naval Standoff',
    category: 'military',
    title: 'South China Sea -- Naval Standoff',
    selectedTheaters: [
      { label: 'Spratly Islands Military Buildup', region: 'Southeast Asia', stateKind: 'conflict', rankingScore: 0.92 },
      { label: 'ASEAN Maritime Dispute Zone', region: 'Indo-Pacific', stateKind: 'tension', rankingScore: 0.78 },
    ],
    entities: [
      { name: 'PLA Navy Southern Theater', class: 'state_actor', stance: 'aggressive', objectives: ['Enforce nine-dash line', 'Expand artificial island bases'], constraints: ['Avoid direct US engagement'], relationships: [{ target: 'US Pacific Fleet', type: 'adversary' }] },
      { name: 'US Pacific Fleet', class: 'state_actor', stance: 'deterrent', objectives: ['Maintain freedom of navigation', 'Support allied patrols'], constraints: ['Congressional authorization limits'], relationships: [{ target: 'PLA Navy Southern Theater', type: 'adversary' }] },
      { name: 'Philippine Coast Guard', class: 'state_actor', stance: 'defensive', objectives: ['Protect EEZ rights', 'Document incursions'], constraints: ['Limited naval capability'], relationships: [{ target: 'US Pacific Fleet', type: 'ally' }] },
      { name: 'ASEAN Maritime Coalition', class: 'multilateral', stance: 'neutral', objectives: ['De-escalate tensions', 'Establish code of conduct'], constraints: ['Consensus-based decision making'], relationships: [] },
    ],
    eventSeeds: [
      { type: 'military', summary: 'PLA Navy conducts live-fire exercises near Scarborough Shoal', timing: 'near-term', strength: 0.85 },
      { type: 'military', summary: 'US carrier strike group repositions to Philippine Sea', timing: 'near-term', strength: 0.80 },
      { type: 'incident', summary: 'Fishing vessel collision in disputed waters triggers diplomatic row', timing: 'near-term', strength: 0.60 },
    ],
    constraints: {
      hard: ['No nuclear weapon deployment', 'Civilian shipping lanes remain open'],
      soft: ['Prefer diplomatic resolution channels', 'Limit military exercises to announced zones'],
    },
    simulationRequirement: 'Model escalation dynamics between PLA Navy and US Pacific Fleet over Spratly Islands territorial disputes, including ASEAN mediation attempts and Philippine defensive responses.',
  },
  {
    id: 'taiwan-strait',
    label: 'Taiwan Strait -- Semiconductor Crisis',
    category: 'market',
    title: 'Taiwan Strait -- Semiconductor Crisis',
    selectedTheaters: [
      { label: 'Cross-Strait Military Posturing', region: 'East Asia', stateKind: 'crisis', rankingScore: 0.95 },
      { label: 'TSMC Supply Chain Disruption Risk', region: 'Global', commodity: 'semiconductors', stateKind: 'market_shock', rankingScore: 0.88 },
    ],
    entities: [
      { name: 'PLA Eastern Theater Command', class: 'state_actor', stance: 'aggressive', objectives: ['Demonstrate reunification capability', 'Pressure Taiwan diplomatically'], constraints: ['Avoid triggering US defense treaty'], relationships: [{ target: 'Taiwan Ministry of Defense', type: 'adversary' }] },
      { name: 'Taiwan Ministry of Defense', class: 'state_actor', stance: 'defensive', objectives: ['Maintain sovereign defense posture', 'Secure semiconductor facilities'], constraints: ['Limited offensive capability'], relationships: [{ target: 'Japan Self-Defense Forces', type: 'ally' }] },
      { name: 'TSMC Corporation', class: 'corporation', stance: 'neutral', objectives: ['Maintain production continuity', 'Diversify fab locations'], constraints: ['Cannot relocate primary fabs quickly'], relationships: [] },
      { name: 'Japan Self-Defense Forces', class: 'state_actor', stance: 'deterrent', objectives: ['Protect sea lanes', 'Support US alliance framework'], constraints: ['Constitutional limitations on offensive operations'], relationships: [{ target: 'Taiwan Ministry of Defense', type: 'ally' }] },
    ],
    eventSeeds: [
      { type: 'military', summary: 'Unprecedented ADIZ incursions by PLA aircraft over 72-hour period', timing: 'near-term', strength: 0.90 },
      { type: 'economic', summary: 'Emergency chip export controls imposed amid rising tensions', timing: 'near-term', strength: 0.75 },
    ],
    constraints: {
      hard: ['No first-strike scenarios', 'TSMC operations assessed as non-targetable'],
      soft: ['Diplomatic back-channels remain active', 'Economic sanctions preferred over kinetic options'],
    },
    simulationRequirement: 'Simulate cross-strait escalation dynamics and their cascading impact on global semiconductor supply chains, including TSMC production risk and allied defense responses.',
  },
  {
    id: 'eastern-europe',
    label: 'Eastern Europe -- NATO-Russia Tensions',
    category: 'political',
    title: 'Eastern Europe -- NATO-Russia Tensions',
    selectedTheaters: [
      { label: 'Ukraine Ceasefire Dynamics', region: 'Eastern Europe', stateKind: 'conflict', rankingScore: 0.90 },
      { label: 'Baltic Defense Posture', region: 'Northern Europe', stateKind: 'tension', rankingScore: 0.74 },
    ],
    entities: [
      { name: 'NATO Allied Command Europe', class: 'multilateral', stance: 'deterrent', objectives: ['Reinforce eastern flank', 'Support Ukraine sovereignty'], constraints: ['Article 5 threshold ambiguity'], relationships: [{ target: 'Russian Security Council', type: 'adversary' }] },
      { name: 'Russian Security Council', class: 'state_actor', stance: 'aggressive', objectives: ['Maintain strategic buffer zones', 'Undermine NATO cohesion'], constraints: ['Economic sanctions pressure', 'Military resource limitations'], relationships: [{ target: 'NATO Allied Command Europe', type: 'adversary' }] },
      { name: 'EU Diplomatic Service', class: 'multilateral', stance: 'neutral', objectives: ['Negotiate ceasefire terms', 'Maintain energy security'], constraints: ['Member state consensus required'], relationships: [] },
    ],
    eventSeeds: [
      { type: 'diplomatic', summary: 'Ceasefire negotiations stall over territorial sovereignty terms', timing: 'near-term', strength: 0.70 },
      { type: 'military', summary: 'Large-scale troop movements detected near Baltic borders', timing: 'mid-term', strength: 0.65 },
      { type: 'economic', summary: 'Energy pipeline dispute escalates between EU and Russia', timing: 'near-term', strength: 0.55 },
    ],
    constraints: {
      hard: ['No direct NATO-Russia kinetic engagement', 'Nuclear escalation off the table'],
      soft: ['Ceasefire terms should preserve Ukrainian territorial integrity', 'Energy transition timelines respected'],
    },
    simulationRequirement: 'Model NATO-Russia tensions across Ukraine ceasefire negotiations and Baltic defense posturing, including EU mediation efforts and energy security dynamics.',
  },
  {
    id: 'red-sea',
    label: 'Red Sea -- Shipping Crisis',
    category: 'military',
    title: 'Red Sea -- Shipping Crisis',
    selectedTheaters: [
      { label: 'Houthi Maritime Interdiction Zone', region: 'Middle East', stateKind: 'conflict', rankingScore: 0.88 },
      { label: 'Suez Canal Disruption Corridor', region: 'Global Trade', commodity: 'shipping', stateKind: 'market_shock', rankingScore: 0.82 },
    ],
    entities: [
      { name: 'Ansar Allah (Houthi Forces)', class: 'non_state_actor', stance: 'aggressive', objectives: ['Disrupt Red Sea shipping', 'Leverage geopolitical pressure'], constraints: ['Limited precision strike capability'], relationships: [{ target: 'US CENTCOM', type: 'adversary' }] },
      { name: 'US Central Command', class: 'state_actor', stance: 'deterrent', objectives: ['Protect international shipping lanes', 'Degrade anti-ship missile capability'], constraints: ['Rules of engagement limitations'], relationships: [{ target: 'Royal Navy Task Force', type: 'ally' }] },
      { name: 'Royal Navy Task Force', class: 'state_actor', stance: 'defensive', objectives: ['Escort commercial vessels', 'Provide maritime domain awareness'], constraints: ['Limited sustained deployment capacity'], relationships: [{ target: 'US Central Command', type: 'ally' }] },
      { name: 'Egyptian Government', class: 'state_actor', stance: 'neutral', objectives: ['Maintain Suez Canal revenue', 'Avoid regional escalation'], constraints: ['Balancing regional alliances'], relationships: [] },
    ],
    eventSeeds: [
      { type: 'military', summary: 'Anti-ship ballistic missile attack on commercial tanker in Bab el-Mandeb strait', timing: 'near-term', strength: 0.88 },
      { type: 'economic', summary: 'Maritime insurance premiums surge 300% for Red Sea transit routes', timing: 'near-term', strength: 0.72 },
    ],
    constraints: {
      hard: ['Civilian casualties must be minimized', 'Suez Canal sovereignty respected'],
      soft: ['Coalition responses proportional to threat', 'Diplomatic channels with regional actors maintained'],
    },
    simulationRequirement: 'Simulate Red Sea shipping crisis dynamics including Houthi maritime attacks, coalition naval responses, and cascading effects on global trade via Suez Canal disruption.',
  },
  {
    id: 'persian-gulf',
    label: 'Persian Gulf -- Oil Market Shock',
    category: 'market',
    title: 'Persian Gulf -- Oil Market Shock',
    selectedTheaters: [
      { label: 'Strait of Hormuz Transit Risk', region: 'Middle East', commodity: 'oil', stateKind: 'crisis', rankingScore: 0.91 },
      { label: 'OPEC+ Supply Dynamics', region: 'Global', commodity: 'oil', stateKind: 'market_shift', rankingScore: 0.79 },
    ],
    entities: [
      { name: 'IRGC Navy', class: 'state_actor', stance: 'aggressive', objectives: ['Assert Strait of Hormuz control', 'Deter foreign naval presence'], constraints: ['Risk of triggering US military response'], relationships: [{ target: 'Saudi Aramco', type: 'adversary' }] },
      { name: 'Saudi Aramco', class: 'corporation', stance: 'defensive', objectives: ['Maintain oil export capacity', 'Stabilize global energy markets'], constraints: ['Dependent on Gulf shipping routes'], relationships: [{ target: 'OPEC+ Alliance', type: 'ally' }] },
      { name: 'OPEC+ Alliance', class: 'multilateral', stance: 'neutral', objectives: ['Manage production quotas', 'Stabilize oil prices'], constraints: ['Member state compliance varies'], relationships: [] },
      { name: 'International Energy Agency', class: 'multilateral', stance: 'neutral', objectives: ['Coordinate strategic reserve releases', 'Monitor supply disruptions'], constraints: ['Limited direct intervention capability'], relationships: [] },
    ],
    eventSeeds: [
      { type: 'military', summary: 'IRGC seizes commercial tanker in Strait of Hormuz transit corridor', timing: 'near-term', strength: 0.85 },
      { type: 'economic', summary: 'OPEC+ announces emergency production cut amid surplus concerns', timing: 'mid-term', strength: 0.70 },
      { type: 'economic', summary: 'IEA coordinates 60-day strategic petroleum reserve release', timing: 'near-term', strength: 0.65 },
    ],
    constraints: {
      hard: ['Oil price cannot exceed historical maximum', 'Physical infrastructure attacks excluded'],
      soft: ['Diplomatic solutions through GCC framework preferred', 'Market interventions time-limited'],
    },
    simulationRequirement: 'Model oil market shock dynamics from Strait of Hormuz disruptions, including OPEC+ supply responses, strategic reserve coordination, and global price cascade effects.',
  },
  {
    id: 'korean-peninsula',
    label: 'Korean Peninsula -- Missile Crisis',
    category: 'military',
    title: 'Korean Peninsula -- Missile Crisis',
    selectedTheaters: [
      { label: 'DPRK ICBM Testing Program', region: 'East Asia', stateKind: 'crisis', rankingScore: 0.93 },
      { label: 'ROK-Japan Joint Defense', region: 'Pacific', stateKind: 'tension', rankingScore: 0.76 },
    ],
    entities: [
      { name: 'DPRK Strategic Rocket Forces', class: 'state_actor', stance: 'aggressive', objectives: ['Demonstrate ICBM capability', 'Extract sanctions relief'], constraints: ['Economic isolation limits sustainment'], relationships: [{ target: 'US Forces Korea', type: 'adversary' }] },
      { name: 'ROK Joint Chiefs of Staff', class: 'state_actor', stance: 'defensive', objectives: ['Maintain peninsular deterrence', 'Protect civilian population'], constraints: ['Seoul vulnerability to conventional artillery'], relationships: [{ target: 'US Forces Korea', type: 'ally' }] },
      { name: 'Japan Self-Defense Forces', class: 'state_actor', stance: 'defensive', objectives: ['Ballistic missile defense', 'Protect Japanese territory'], constraints: ['Constitutional limitations on preemptive action'], relationships: [{ target: 'ROK Joint Chiefs of Staff', type: 'ally' }] },
      { name: 'US Forces Korea', class: 'state_actor', stance: 'deterrent', objectives: ['Extended deterrence', 'Alliance reassurance'], constraints: ['Escalation management requirements'], relationships: [{ target: 'ROK Joint Chiefs of Staff', type: 'ally' }] },
    ],
    eventSeeds: [
      { type: 'military', summary: 'DPRK conducts solid-fuel ICBM test with extended range trajectory', timing: 'near-term', strength: 0.92 },
      { type: 'diplomatic', summary: 'UN Security Council emergency session on DPRK provocations', timing: 'near-term', strength: 0.60 },
    ],
    constraints: {
      hard: ['No nuclear weapon use', 'No regime change operations'],
      soft: ['Diplomatic off-ramp maintained via China', 'Military responses proportional and defensive'],
    },
    simulationRequirement: 'Simulate Korean Peninsula missile crisis escalation dynamics, including DPRK provocation cycles, allied defense coordination, and diplomatic resolution pathways.',
  },
  {
    id: 'arctic',
    label: 'Arctic -- Great Power Competition',
    category: 'political',
    title: 'Arctic -- Great Power Competition',
    selectedTheaters: [
      { label: 'Northern Sea Route Control', region: 'Arctic', stateKind: 'competition', rankingScore: 0.72 },
      { label: 'Arctic Resource Extraction Disputes', region: 'Arctic', commodity: 'minerals', stateKind: 'tension', rankingScore: 0.68 },
    ],
    entities: [
      { name: 'Russian Arctic Command', class: 'state_actor', stance: 'aggressive', objectives: ['Control Northern Sea Route', 'Expand Arctic military bases'], constraints: ['Climate change unpredictability'], relationships: [{ target: 'NATO Arctic Council', type: 'adversary' }] },
      { name: 'China Polar Research Institute', class: 'state_actor', stance: 'expansionist', objectives: ['Secure Arctic shipping access', 'Establish research presence'], constraints: ['Non-Arctic state limitations'], relationships: [{ target: 'Russian Arctic Command', type: 'partner' }] },
      { name: 'NATO Arctic Council Members', class: 'multilateral', stance: 'defensive', objectives: ['Maintain rules-based Arctic order', 'Counter militarization'], constraints: ['Consensus requirements among members'], relationships: [{ target: 'Canadian Armed Forces', type: 'ally' }] },
      { name: 'Canadian Armed Forces', class: 'state_actor', stance: 'defensive', objectives: ['Assert Northwest Passage sovereignty', 'Monitor Arctic approaches'], constraints: ['Vast territory with limited assets'], relationships: [{ target: 'NATO Arctic Council Members', type: 'ally' }] },
    ],
    eventSeeds: [
      { type: 'military', summary: 'Russian icebreaker fleet deploys to disputed continental shelf zone', timing: 'mid-term', strength: 0.65 },
      { type: 'diplomatic', summary: 'Competing territorial claims filed with UN Commission on Continental Shelf', timing: 'mid-term', strength: 0.55 },
    ],
    constraints: {
      hard: ['Arctic Treaty environmental protections maintained', 'Indigenous community rights respected'],
      soft: ['Scientific cooperation continues despite tensions', 'Military activity limited to defensive posture'],
    },
    simulationRequirement: 'Model great power competition in the Arctic including Northern Sea Route control, resource extraction disputes, and the interplay between military posturing and environmental governance.',
  },
  {
    id: 'sahel',
    label: 'Sahel -- Instability Cascade',
    category: 'political',
    title: 'Sahel -- Instability Cascade',
    selectedTheaters: [
      { label: 'Alliance of Sahel States Formation', region: 'West Africa', stateKind: 'instability', rankingScore: 0.80 },
      { label: 'ECOWAS-Junta Standoff', region: 'West Africa', stateKind: 'crisis', rankingScore: 0.75 },
    ],
    entities: [
      { name: 'Alliance of Sahel States', class: 'multilateral', stance: 'aggressive', objectives: ['Consolidate junta governments', 'Expel Western military presence'], constraints: ['Economic dependence on neighbors'], relationships: [{ target: 'Wagner Group', type: 'partner' }] },
      { name: 'Wagner Group / Africa Corps', class: 'non_state_actor', stance: 'aggressive', objectives: ['Secure resource extraction contracts', 'Expand Russian influence'], constraints: ['Logistic supply chain vulnerabilities'], relationships: [{ target: 'Alliance of Sahel States', type: 'partner' }] },
      { name: 'ECOWAS Commission', class: 'multilateral', stance: 'defensive', objectives: ['Restore constitutional order', 'Prevent regional destabilization'], constraints: ['Military intervention politically costly'], relationships: [{ target: 'French Republic', type: 'partner' }] },
      { name: 'French Republic', class: 'state_actor', stance: 'defensive', objectives: ['Manage orderly military withdrawal', 'Protect nationals and investments'], constraints: ['Post-colonial sentiment limits influence'], relationships: [{ target: 'ECOWAS Commission', type: 'partner' }] },
    ],
    eventSeeds: [
      { type: 'political', summary: 'Coordinated coup attempt in ECOWAS member state inspired by Sahel juntas', timing: 'near-term', strength: 0.70 },
      { type: 'military', summary: 'Wagner Group deploys additional forces to secure mining operations', timing: 'near-term', strength: 0.65 },
      { type: 'diplomatic', summary: 'France completes military base withdrawal from final Sahel partner', timing: 'mid-term', strength: 0.50 },
    ],
    constraints: {
      hard: ['Humanitarian corridors maintained', 'No international military intervention without UN mandate'],
      soft: ['Transition to civilian rule timelines negotiated', 'Economic sanctions proportional to governance benchmarks'],
    },
    simulationRequirement: 'Simulate Sahel instability dynamics including junta consolidation, Wagner Group expansion, ECOWAS mediation challenges, and French strategic withdrawal impacts.',
  },
  {
    id: 'cyber-global',
    label: 'Global Cyber Threat Landscape',
    category: 'cyber',
    title: 'Global Cyber Threat Landscape',
    selectedTheaters: [
      { label: 'State-Sponsored Cyber Operations', region: 'Global', stateKind: 'conflict', rankingScore: 0.86 },
      { label: 'Critical Infrastructure Targeting', region: 'Global', stateKind: 'crisis', rankingScore: 0.83 },
    ],
    entities: [
      { name: 'NSA Cyber Command', class: 'state_actor', stance: 'defensive', objectives: ['Defend critical infrastructure', 'Attribute state-sponsored attacks'], constraints: ['Offensive operations require authorization'], relationships: [{ target: 'Five Eyes Cyber Alliance', type: 'ally' }] },
      { name: 'Chinese APT Groups', class: 'state_actor', stance: 'aggressive', objectives: ['Exfiltrate intellectual property', 'Pre-position in critical infrastructure'], constraints: ['Risk of detection and attribution'], relationships: [{ target: 'NSA Cyber Command', type: 'adversary' }] },
      { name: 'Russian GRU Unit 74455', class: 'state_actor', stance: 'aggressive', objectives: ['Disrupt Western critical infrastructure', 'Conduct election interference'], constraints: ['Operational security requirements'], relationships: [{ target: 'Five Eyes Cyber Alliance', type: 'adversary' }] },
      { name: 'Five Eyes Cyber Alliance', class: 'multilateral', stance: 'defensive', objectives: ['Share threat intelligence', 'Coordinate defensive operations'], constraints: ['Classification barriers between nations'], relationships: [{ target: 'NSA Cyber Command', type: 'ally' }] },
    ],
    eventSeeds: [
      { type: 'cyber', summary: 'Zero-day exploit chain targeting energy grid SCADA systems discovered in the wild', timing: 'near-term', strength: 0.88 },
      { type: 'cyber', summary: 'Coordinated ransomware campaign hits healthcare systems across multiple nations', timing: 'near-term', strength: 0.80 },
    ],
    constraints: {
      hard: ['No kinetic retaliation for cyber attacks', 'Civilian infrastructure restoration prioritized'],
      soft: ['Attribution confidence threshold of 90% before public accusations', 'Proportional cyber response doctrine'],
    },
    simulationRequirement: 'Model global cyber threat dynamics including state-sponsored operations against critical infrastructure, coordinated defense responses, and the escalation ladder from cyber to diplomatic consequences.',
  },
  {
    id: 'global-economy',
    label: 'Global Economic Realignment',
    category: 'market',
    title: 'Global Economic Realignment',
    selectedTheaters: [
      { label: 'De-Dollarization and Currency Blocs', region: 'Global', commodity: 'currency', stateKind: 'market_shift', rankingScore: 0.81 },
      { label: 'Supply Chain Reshoring Wave', region: 'Global', commodity: 'manufacturing', stateKind: 'structural_change', rankingScore: 0.77 },
      { label: 'AI-Driven Economic Disruption', region: 'Global', stateKind: 'disruption', rankingScore: 0.73 },
    ],
    entities: [
      { name: 'US Federal Reserve', class: 'state_actor', stance: 'defensive', objectives: ['Maintain dollar reserve status', 'Manage inflation without recession'], constraints: ['Political pressure on rate decisions'], relationships: [{ target: 'BRICS Financial Alliance', type: 'competitor' }] },
      { name: 'PBoC (People\'s Bank of China)', class: 'state_actor', stance: 'expansionist', objectives: ['Internationalize yuan', 'Reduce dollar dependency'], constraints: ['Capital controls limit convertibility'], relationships: [{ target: 'BRICS Financial Alliance', type: 'ally' }] },
      { name: 'European Central Bank', class: 'state_actor', stance: 'neutral', objectives: ['Maintain eurozone stability', 'Hedge against dollar and yuan shifts'], constraints: ['Divergent member state economies'], relationships: [] },
      { name: 'BRICS Financial Alliance', class: 'multilateral', stance: 'expansionist', objectives: ['Create alternative payment systems', 'Reduce Western financial dominance'], constraints: ['Internal economic disparities'], relationships: [{ target: 'PBoC (People\'s Bank of China)', type: 'ally' }] },
      { name: 'International Monetary Fund', class: 'multilateral', stance: 'neutral', objectives: ['Preserve global financial stability', 'Reform SDR basket composition'], constraints: ['Governance reform pressures'], relationships: [] },
    ],
    eventSeeds: [
      { type: 'economic', summary: 'Major oil exporter announces yuan-denominated crude contracts', timing: 'near-term', strength: 0.72 },
      { type: 'economic', summary: 'Semiconductor tariff escalation triggers supply chain bifurcation', timing: 'near-term', strength: 0.78 },
    ],
    constraints: {
      hard: ['No sovereign debt defaults in G20 nations', 'International trade continues despite friction'],
      soft: ['Transition timelines measured in years not months', 'Financial stability mechanisms activated as needed'],
    },
    simulationRequirement: 'Model global economic realignment dynamics including de-dollarization trends, supply chain reshoring decisions, and AI-driven disruption effects on international trade and financial systems.',
  },
];

/**
 * Find a scenario template by its unique ID.
 * Returns undefined if no template matches.
 */
export function findTemplate(id: string): ScenarioTemplate | undefined {
  return SCENARIO_TEMPLATES.find((t) => t.id === id);
}

/**
 * Return a lightweight summary of all templates (id, label, category).
 * Suitable for public API responses and frontend dropdowns.
 */
export function getTemplateSummaries(): Array<{
  id: string;
  label: string;
  category: string;
}> {
  return SCENARIO_TEMPLATES.map(({ id, label, category }) => ({
    id,
    label,
    category,
  }));
}
