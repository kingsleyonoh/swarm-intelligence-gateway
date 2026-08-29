import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EcosystemEventPublisher,
  type EcosystemEventEnvelope,
} from '../../src/ecosystem/events.js';

describe('EcosystemEventPublisher', () => {
  let server: Server;
  let received: EcosystemEventEnvelope[];
  let endpoint: string;

  beforeEach(async () => {
    received = [];
    server = createServer(async (request, response) => {
      if (request.url !== '/api/events') {
        response.statusCode = 404;
        response.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received.push(JSON.parse(Buffer.concat(chunks).toString()) as EcosystemEventEnvelope);
      response.statusCode = 202;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ accepted: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    endpoint = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('posts the standard envelope when notifications are enabled', async () => {
    const publisher = new EcosystemEventPublisher({
      enabled: true,
      baseUrl: endpoint,
      apiKey: 'test-key',
    });

    const delivered = await publisher.publish('simulation.completed', 'tenant-1', {
      simulationId: 'simulation-1',
      confidence: 0.84,
    });

    expect(delivered).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      event_type: 'simulation.completed',
      event_id: expect.any(String),
      source: 'swarm-gateway',
      tenant_id: 'tenant-1',
      payload: { simulationId: 'simulation-1', confidence: 0.84 },
    });
    expect(Date.parse(received[0].timestamp)).not.toBeNaN();
  });

  it('does not make a request when notifications are disabled', async () => {
    const publisher = new EcosystemEventPublisher({ enabled: false });

    await expect(publisher.publish('simulation.completed', 'tenant-1', {})).resolves.toBe(false);
    expect(received).toHaveLength(0);
  });

  it('fails fast when enabled without a hub URL or API key', async () => {
    const publisher = new EcosystemEventPublisher({ enabled: true });

    await expect(publisher.publish('simulation.failed', 'tenant-1', {}))
      .rejects.toThrow(/NOTIFICATION_HUB_URL and NOTIFICATION_HUB_API_KEY/);
  });
});
