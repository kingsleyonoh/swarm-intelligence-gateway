/** Resolves WorldMonitor's Redis value, including its R2-backed pointer form. */

export interface SimulationPackagePointer {
  runId: string;
  pkgKey: string;
  schemaVersion: string;
  theaterCount: number;
  generatedAt: number;
}

export interface WorldMonitorR2Config {
  accountId: string;
  bucket: string;
  apiToken: string;
  apiBaseUrl?: string;
}

export type PackageFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

/** Return true only for the complete pointer shape published by WorldMonitor. */
export function isSimulationPackagePointer(
  value: unknown,
): value is SimulationPackagePointer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pointer = value as Record<string, unknown>;
  return typeof pointer.runId === 'string'
    && typeof pointer.pkgKey === 'string'
    && typeof pointer.schemaVersion === 'string'
    && typeof pointer.theaterCount === 'number'
    && typeof pointer.generatedAt === 'number';
}

function encodedObjectPath(key: string): string {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

/** Resolve a direct package or fetch the object named by the current pointer. */
export async function resolveSimulationPackage(
  value: unknown,
  config: WorldMonitorR2Config | undefined,
  fetcher: PackageFetcher = fetch,
): Promise<unknown> {
  if (!isSimulationPackagePointer(value)) return value;
  if (!config) {
    throw new Error('WorldMonitor package pointer requires R2 configuration');
  }

  const apiBaseUrl = (config.apiBaseUrl ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
  const url = `${apiBaseUrl}/accounts/${encodeURIComponent(config.accountId)}`
    + `/r2/buckets/${encodeURIComponent(config.bucket)}/objects/${encodedObjectPath(value.pkgKey)}`;
  const response = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apiToken}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`WorldMonitor R2 package fetch failed: HTTP ${response.status}`);
  }
  return response.json();
}
