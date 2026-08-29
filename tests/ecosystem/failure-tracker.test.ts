import { describe, expect, it, vi } from 'vitest';

import { WorldMonitorFailureTracker } from '../../src/ecosystem/failure-tracker.js';

describe('WorldMonitorFailureTracker', () => {
  it('publishes once when a tenant reaches three consecutive failures', async () => {
    const publisher = { publish: vi.fn().mockResolvedValue(true) };
    const tracker = new WorldMonitorFailureTracker(publisher, 3);

    await tracker.recordFailure('tenant-1', 'Redis unavailable');
    await tracker.recordFailure('tenant-1', 'Redis unavailable');
    await tracker.recordFailure('tenant-1', 'Redis unavailable');
    await tracker.recordFailure('tenant-1', 'Redis unavailable');

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      'worldmonitor.unavailable',
      'tenant-1',
      expect.objectContaining({ consecutiveFailures: 3, error: 'Redis unavailable' }),
    );
  });

  it('resets the failure streak after a successful poll', async () => {
    const publisher = { publish: vi.fn().mockResolvedValue(true) };
    const tracker = new WorldMonitorFailureTracker(publisher, 3);

    await tracker.recordFailure('tenant-1', 'Redis unavailable');
    tracker.recordSuccess('tenant-1');
    await tracker.recordFailure('tenant-1', 'Redis unavailable');

    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
