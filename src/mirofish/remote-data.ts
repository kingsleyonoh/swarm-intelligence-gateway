import type {
  ActionLogEntry,
  MirofishAgentProfile,
  MirofishGraphData,
  MirofishGraphEdge,
  MirofishGraphNode,
} from './types.js';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Convert an upstream action record into the gateway's stable shape. */
export function normalizeAction(value: unknown, fallbackPlatform = 'twitter'): ActionLogEntry | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const agentId = asNumber(raw.agent_id);
  const actionType = asString(raw.action_type);
  if (agentId === undefined || !actionType) return null;

  const args = asRecord(raw.action_args);
  const metadata = { ...(asRecord(raw.metadata) ?? {}) };
  if (raw.result !== undefined) metadata.result = raw.result;
  if (raw.success !== undefined) metadata.success = raw.success;

  const action: ActionLogEntry = {
    agent_id: agentId,
    round: asNumber(raw.round_num) ?? asNumber(raw.round) ?? 0,
    platform: asString(raw.platform) ?? fallbackPlatform,
    action_type: actionType,
    content: asString(args?.content) ?? asString(raw.content) ?? '',
    metadata,
  };
  const agentName = asString(raw.agent_name);
  const timestamp = asString(raw.timestamp);
  if (agentName) action.agent_name = agentName;
  if (args) action.action_args = args as ActionLogEntry['action_args'];
  if (timestamp) action.timestamp = timestamp;
  return action;
}

/** Parse JSONL action logs and report malformed lines without hiding them. */
export function parseActionLogJsonl(content: string, platform = 'twitter'): {
  entries: ActionLogEntry[];
  malformedLines: number;
} {
  const entries: ActionLogEntry[] = [];
  let malformedLines = 0;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = normalizeAction(JSON.parse(line) as unknown, platform);
      if (entry) entries.push(entry);
      else malformedLines++;
    } catch (error) {
      malformedLines++;
      void error;
    }
  }
  return { entries, malformedLines };
}

/** Unwrap and validate the current MiroFish graph data response. */
export function normalizeGraphData(response: unknown): MirofishGraphData {
  const envelope = asRecord(response);
  const data = asRecord(envelope?.data) ?? envelope;
  const graphId = asString(data?.graph_id);
  const nodes = Array.isArray(data?.nodes) ? data.nodes as MirofishGraphNode[] : [];
  const edges = Array.isArray(data?.edges) ? data.edges as MirofishGraphEdge[] : [];
  if (!graphId) throw new Error('MiroFish graph response has no graph_id');
  return { graphId, nodes, edges };
}

/** Unwrap the profile list returned by MiroFish after preparation. */
export function normalizeProfiles(response: unknown): MirofishAgentProfile[] {
  const envelope = asRecord(response);
  const data = asRecord(envelope?.data) ?? envelope;
  if (!Array.isArray(data?.profiles)) return [];
  return data.profiles.filter((profile): profile is MirofishAgentProfile => {
    const record = asRecord(profile);
    return asNumber(record?.user_id) !== undefined && Boolean(asString(record?.username));
  });
}
