import { request } from 'undici';
import crypto from 'node:crypto';

import { env } from '../config/env.js';

export type EcosystemEventType =
  | 'simulation.completed'
  | 'simulation.failed'
  | 'worldmonitor.unavailable';

export interface EcosystemEventEnvelope {
  event_type: EcosystemEventType;
  event_id: string;
  source: 'swarm-gateway';
  tenant_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface EcosystemEventPublisherOptions {
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

/** Sends the gateway's standard event envelope to the Notification Hub. */
export class EcosystemEventPublisher {
  private readonly options: EcosystemEventPublisherOptions;

  constructor(options: EcosystemEventPublisherOptions = defaultOptions()) {
    this.options = { timeoutMs: 5000, ...options };
  }

  async publish(
    eventType: EcosystemEventType,
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.options.enabled) return false;
    if (!this.options.baseUrl || !this.options.apiKey) {
      throw new Error('NOTIFICATION_HUB_URL and NOTIFICATION_HUB_API_KEY are required when notifications are enabled');
    }

    const event: EcosystemEventEnvelope = {
      event_type: eventType,
      event_id: crypto.randomUUID(),
      source: 'swarm-gateway',
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      payload,
    };
    const response = await request(`${this.options.baseUrl.replace(/\/$/, '')}/api/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`,
        'x-api-key': this.options.apiKey,
      },
      body: JSON.stringify(event),
      bodyTimeout: this.options.timeoutMs,
      headersTimeout: this.options.timeoutMs,
    });
    if (response.statusCode >= 400) {
      throw new Error(`Notification Hub rejected ${eventType}: HTTP ${response.statusCode}`);
    }
    return true;
  }
}

function defaultOptions(): EcosystemEventPublisherOptions {
  return {
    enabled: env.NOTIFICATION_HUB_ENABLED,
    baseUrl: env.NOTIFICATION_HUB_URL,
    apiKey: env.NOTIFICATION_HUB_API_KEY,
  };
}

export const notificationPublisher = new EcosystemEventPublisher();
