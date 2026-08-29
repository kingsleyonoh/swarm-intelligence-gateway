import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  withScope: vi.fn((callback: (scope: { setExtra: (key: string, value: unknown) => void }) => void) => {
    callback({ setExtra: vi.fn() });
  }),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

vi.mock('@sentry/node', () => sentry);

describe('Sentry telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('initializes only when SENTRY_DSN is configured and captures context', async () => {
    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    const telemetry = await import('../../src/shared/sentry.js');

    expect(telemetry.initTelemetry()).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: process.env.SENTRY_DSN,
      environment: expect.any(String),
      sendDefaultPii: false,
    }));

    const error = new Error('pipeline failed');
    telemetry.captureError(error, { simulationId: 'sim-1' });
    await telemetry.flushTelemetry(1000);

    expect(sentry.withScope).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.flush).toHaveBeenCalledWith(1000);
  });

  it('does not initialize or send when SENTRY_DSN is absent', async () => {
    delete process.env.SENTRY_DSN;
    const telemetry = await import('../../src/shared/sentry.js');

    expect(telemetry.initTelemetry()).toBe(false);
    telemetry.captureError(new Error('ignored'));
    await telemetry.flushTelemetry();

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });
});
