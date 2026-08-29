import { notificationPublisher, type EcosystemEventPublisher } from './events.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger({ module: 'worldmonitor-failure-tracker' });

export interface EcosystemPublisher {
  publish(
    eventType: 'worldmonitor.unavailable',
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean>;
}

/** Emits one unavailable event per outage streak, per tenant. */
export class WorldMonitorFailureTracker {
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly publisher: EcosystemPublisher = notificationPublisher as EcosystemEventPublisher,
    private readonly threshold = 3,
  ) {}

  recordSuccess(tenantId: string): void {
    this.failures.delete(tenantId);
  }

  async recordFailure(tenantId: string, error: string): Promise<void> {
    const count = (this.failures.get(tenantId) ?? 0) + 1;
    this.failures.set(tenantId, count);
    if (count !== this.threshold) return;
    try {
      await this.publisher.publish('worldmonitor.unavailable', tenantId, {
        consecutiveFailures: count,
        error,
      });
    } catch (publishError) {
      log.warn(
        { tenantId, error: publishError instanceof Error ? publishError.message : String(publishError) },
        'Could not publish WorldMonitor outage event',
      );
    }
  }
}

export const worldMonitorFailureTracker = new WorldMonitorFailureTracker();
