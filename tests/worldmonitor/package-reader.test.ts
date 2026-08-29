import { describe, expect, it, vi } from 'vitest';

import {
  isSimulationPackagePointer,
  resolveSimulationPackage,
} from '../../src/worldmonitor/package-reader.js';

const pointer = {
  runId: 'wm-run-1',
  pkgKey: 'seed-data/forecast-traces/2026/run-1/simulation-package.json',
  schemaVersion: 'simulation-package.v2',
  theaterCount: 1,
  generatedAt: 1_756_378_800_000,
};

describe('WorldMonitor simulation package pointer', () => {
  it('recognizes the current Redis pointer contract', () => {
    expect(isSimulationPackagePointer(pointer)).toBe(true);
    expect(isSimulationPackagePointer({ ...pointer, pkgKey: 42 })).toBe(false);
  });

  it('downloads the pointed-to package through the Cloudflare R2 API', async () => {
    const packageValue = { runId: pointer.runId, selectedTheaters: [] };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(packageValue), { status: 200 }),
    );

    const result = await resolveSimulationPackage(pointer, {
      accountId: 'account-1',
      bucket: 'forecast-traces',
      apiToken: 'token-1',
      apiBaseUrl: 'https://api.cloudflare.test/client/v4',
    }, fetcher);

    expect(result).toEqual(packageValue);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.cloudflare.test/client/v4/accounts/account-1/r2/buckets/forecast-traces/objects/seed-data/forecast-traces/2026/run-1/simulation-package.json',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
  });

  it('fails clearly when R2 credentials are absent for a pointer', async () => {
    await expect(resolveSimulationPackage(pointer, undefined)).rejects.toThrow(
      'WorldMonitor package pointer requires R2 configuration',
    );
  });

  it('leaves a direct package untouched', async () => {
    const directPackage = { runId: 'direct-run', selectedTheaters: [] };
    const fetcher = vi.fn();

    await expect(resolveSimulationPackage(directPackage, undefined, fetcher))
      .resolves.toBe(directPackage);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
