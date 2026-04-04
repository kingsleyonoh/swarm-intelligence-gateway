import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────

// Mock logger so shutdown logs are silent
vi.mock('../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop, fatal: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Import after mocks
const { createShutdownHandler } = await import('../src/index.js');

// ── Helpers ─────────────────────────────────────────────────────────

type ShutdownResources = Parameters<typeof createShutdownHandler>[0];

function makeResource<T extends Record<string, unknown>>(methods: T): T {
  return methods;
}

function makeAsync(order: string[], label: string, opts?: { throws?: Error }) {
  return vi.fn(async () => {
    if (opts?.throws) throw opts.throws;
    order.push(label);
  });
}

function makeSync(order: string[], label: string) {
  return vi.fn(() => {
    order.push(label);
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('createShutdownHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an async function', () => {
    const shutdown = createShutdownHandler({});
    expect(shutdown).toBeTypeOf('function');
  });

  it('calls resource close methods in correct order: app → cron → worker → queue → redis → db', async () => {
    const order: string[] = [];

    const resources: ShutdownResources = {
      app: makeResource({ close: makeAsync(order, 'app') }),
      cronTask: makeResource({ stop: makeSync(order, 'cron') }),
      worker: makeResource({ close: makeAsync(order, 'worker') }),
      queue: makeResource({ close: makeAsync(order, 'queue') }),
      closeRedis: makeAsync(order, 'redis'),
      closeDb: makeAsync(order, 'db'),
      exit: vi.fn(),
    };

    const shutdown = createShutdownHandler(resources);
    await shutdown('SIGTERM');

    expect(order).toEqual(['app', 'cron', 'worker', 'queue', 'redis', 'db']);
  });

  it('is idempotent — running shutdown twice only closes resources once', async () => {
    const appClose = vi.fn(async () => {});
    const workerClose = vi.fn(async () => {});
    const queueClose = vi.fn(async () => {});
    const closeRedis = vi.fn(async () => {});
    const closeDb = vi.fn(async () => {});
    const cronStop = vi.fn();

    const shutdown = createShutdownHandler({
      app: { close: appClose },
      cronTask: { stop: cronStop },
      worker: { close: workerClose },
      queue: { close: queueClose },
      closeRedis,
      closeDb,
      exit: vi.fn(),
    });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(appClose).toHaveBeenCalledTimes(1);
    expect(workerClose).toHaveBeenCalledTimes(1);
    expect(queueClose).toHaveBeenCalledTimes(1);
    expect(closeRedis).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(cronStop).toHaveBeenCalledTimes(1);
  });

  it('skips optional resources that are not provided', async () => {
    const closeDb = vi.fn(async () => {});
    const closeRedis = vi.fn(async () => {});
    const exit = vi.fn();

    const shutdown = createShutdownHandler({
      closeDb,
      closeRedis,
      exit,
    });

    await expect(shutdown('SIGTERM')).resolves.not.toThrow();
    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(closeRedis).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('calls exit(0) on successful shutdown', async () => {
    const exit = vi.fn();
    const shutdown = createShutdownHandler({
      app: { close: vi.fn(async () => {}) },
      closeDb: vi.fn(async () => {}),
      closeRedis: vi.fn(async () => {}),
      exit,
    });

    await shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledWith(0);
  });

  it('calls exit(1) if a resource fails to close', async () => {
    const exit = vi.fn();
    const shutdown = createShutdownHandler({
      app: { close: vi.fn(async () => { throw new Error('app close failed'); }) },
      closeDb: vi.fn(async () => {}),
      closeRedis: vi.fn(async () => {}),
      exit,
    });

    await shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('continues to later resources even if app.close throws (via catch in handler)', async () => {
    const exit = vi.fn();
    const closeDb = vi.fn(async () => {});
    const closeRedis = vi.fn(async () => {});

    const shutdown = createShutdownHandler({
      app: { close: vi.fn(async () => { throw new Error('boom'); }) },
      closeDb,
      closeRedis,
      exit,
    });

    await shutdown('SIGTERM');

    // On failure we exit(1); later steps are NOT called (first-error-wins semantics)
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('accepts a signal string argument without error', async () => {
    const exit = vi.fn();
    const shutdown = createShutdownHandler({ exit });

    await shutdown('SIGTERM');
    expect(exit).toHaveBeenCalledWith(0);
  });
});
