import { describe, it, expect } from 'vitest';
import { envSchema } from '../../src/config/env.js';

/** Minimal valid env — only the truly required fields */
const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
  REDIS_URL: 'redis://localhost:6379',
};

describe('envSchema', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it('should parse valid env vars with all fields', () => {
    const full = {
      ...VALID_ENV,
      PORT: '4000',
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      POLL_INTERVAL_MINUTES: '30',
      DEFAULT_AGENT_COUNT: '2048',
      DEFAULT_ROUND_COUNT: '3',
      DATA_RETENTION_DAYS: '60',
      SELF_REGISTRATION_ENABLED: 'false',
      NOTIFICATION_HUB_ENABLED: 'true',
      DEMO_MODE: 'true',
      WORLDMONITOR_REDIS_URL: 'rediss://default:tok@host:6379',
      WORLDMONITOR_REDIS_TOKEN: 'some-token',
      MIROFISH_API_URL: 'http://localhost:5000',
      DEEPSEEK_API_KEY: 'sk-deep',
      NOTIFICATION_HUB_URL: 'http://hub:8000',
      NOTIFICATION_HUB_API_KEY: 'hub-key',
      WEBHOOK_SECRET: 'secret',
      SENTRY_DSN: 'https://sentry.io/123',
    };

    const result = envSchema.parse(full);

    expect(result.DATABASE_URL).toBe(full.DATABASE_URL);
    expect(result.REDIS_URL).toBe(full.REDIS_URL);
    expect(result.PORT).toBe(4000);
    expect(result.NODE_ENV).toBe('production');
    expect(result.LOG_LEVEL).toBe('warn');
    expect(result.POLL_INTERVAL_MINUTES).toBe(30);
    expect(result.DEFAULT_AGENT_COUNT).toBe(2048);
    expect(result.DEFAULT_ROUND_COUNT).toBe(3);
    expect(result.DATA_RETENTION_DAYS).toBe(60);
    expect(result.SELF_REGISTRATION_ENABLED).toBe(false);
    expect(result.NOTIFICATION_HUB_ENABLED).toBe(true);
    expect(result.DEMO_MODE).toBe(true);
    expect(result.WORLDMONITOR_REDIS_URL).toBe(full.WORLDMONITOR_REDIS_URL);
    expect(result.MIROFISH_API_URL).toBe(full.MIROFISH_API_URL);
  });

  // ── Defaults ────────────────────────────────────────────────────────

  it('should apply default values when optional vars are omitted', () => {
    const result = envSchema.parse(VALID_ENV);

    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.POLL_INTERVAL_MINUTES).toBe(60);
    expect(result.DEFAULT_AGENT_COUNT).toBe(4096);
    expect(result.DEFAULT_ROUND_COUNT).toBe(5);
    expect(result.DATA_RETENTION_DAYS).toBe(90);
    expect(result.SELF_REGISTRATION_ENABLED).toBe(true);
    expect(result.NOTIFICATION_HUB_ENABLED).toBe(false);
    expect(result.DEMO_MODE).toBe(false);
  });

  // ── Required fields ─────────────────────────────────────────────────

  it('should throw when DATABASE_URL is missing', () => {
    const env = { ...VALID_ENV };
    delete (env as Record<string, unknown>).DATABASE_URL;

    expect(() => envSchema.parse(env)).toThrow();
  });

  it('should throw when REDIS_URL is missing', () => {
    const env = { ...VALID_ENV };
    delete (env as Record<string, unknown>).REDIS_URL;

    expect(() => envSchema.parse(env)).toThrow();
  });

  // ── Type coercion ───────────────────────────────────────────────────

  it('should coerce PORT from string to number', () => {
    const result = envSchema.parse({ ...VALID_ENV, PORT: '8080' });
    expect(result.PORT).toBe(8080);
    expect(typeof result.PORT).toBe('number');
  });

  it('should throw on invalid (non-numeric) PORT', () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, PORT: 'not-a-number' }),
    ).toThrow();
  });

  it('should coerce boolean strings for SELF_REGISTRATION_ENABLED', () => {
    const enabled = envSchema.parse({
      ...VALID_ENV,
      SELF_REGISTRATION_ENABLED: 'true',
    });
    expect(enabled.SELF_REGISTRATION_ENABLED).toBe(true);

    const disabled = envSchema.parse({
      ...VALID_ENV,
      SELF_REGISTRATION_ENABLED: 'false',
    });
    expect(disabled.SELF_REGISTRATION_ENABLED).toBe(false);
  });

  it('should coerce boolean strings for NOTIFICATION_HUB_ENABLED', () => {
    const result = envSchema.parse({
      ...VALID_ENV,
      NOTIFICATION_HUB_ENABLED: 'true',
    });
    expect(result.NOTIFICATION_HUB_ENABLED).toBe(true);
  });

  it('should coerce boolean strings for DEMO_MODE', () => {
    const result = envSchema.parse({
      ...VALID_ENV,
      DEMO_MODE: 'true',
    });
    expect(result.DEMO_MODE).toBe(true);
  });

  // ── NODE_ENV validation ─────────────────────────────────────────────

  it('should accept NODE_ENV=development', () => {
    const result = envSchema.parse({ ...VALID_ENV, NODE_ENV: 'development' });
    expect(result.NODE_ENV).toBe('development');
  });

  it('should accept NODE_ENV=production', () => {
    const result = envSchema.parse({ ...VALID_ENV, NODE_ENV: 'production' });
    expect(result.NODE_ENV).toBe('production');
  });

  it('should accept NODE_ENV=test', () => {
    const result = envSchema.parse({ ...VALID_ENV, NODE_ENV: 'test' });
    expect(result.NODE_ENV).toBe('test');
  });

  it('should throw on invalid NODE_ENV value', () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, NODE_ENV: 'staging' }),
    ).toThrow();
  });

  // ── Optional fields are truly optional ──────────────────────────────

  it('should allow optional fields to be undefined', () => {
    const result = envSchema.parse(VALID_ENV);

    expect(result.WORLDMONITOR_REDIS_URL).toBeUndefined();
    expect(result.WORLDMONITOR_REDIS_TOKEN).toBeUndefined();
    expect(result.MIROFISH_API_URL).toBeUndefined();
    expect(result.DEEPSEEK_API_KEY).toBeUndefined();
    expect(result.NOTIFICATION_HUB_URL).toBeUndefined();
    expect(result.NOTIFICATION_HUB_API_KEY).toBeUndefined();
    expect(result.WEBHOOK_SECRET).toBeUndefined();
    expect(result.SENTRY_DSN).toBeUndefined();
  });

  // ── Numeric coercion for all numeric fields ─────────────────────────

  it('should coerce POLL_INTERVAL_MINUTES from string to number', () => {
    const result = envSchema.parse({
      ...VALID_ENV,
      POLL_INTERVAL_MINUTES: '120',
    });
    expect(result.POLL_INTERVAL_MINUTES).toBe(120);
    expect(typeof result.POLL_INTERVAL_MINUTES).toBe('number');
  });

  it('should coerce DEFAULT_AGENT_COUNT from string to number', () => {
    const result = envSchema.parse({
      ...VALID_ENV,
      DEFAULT_AGENT_COUNT: '8192',
    });
    expect(result.DEFAULT_AGENT_COUNT).toBe(8192);
  });

  it('should coerce DEFAULT_ROUND_COUNT from string to number', () => {
    const result = envSchema.parse({
      ...VALID_ENV,
      DEFAULT_ROUND_COUNT: '10',
    });
    expect(result.DEFAULT_ROUND_COUNT).toBe(10);
  });

  it('should coerce DATA_RETENTION_DAYS from string to number', () => {
    const result = envSchema.parse({
      ...VALID_ENV,
      DATA_RETENTION_DAYS: '30',
    });
    expect(result.DATA_RETENTION_DAYS).toBe(30);
  });

  // ── Empty string handling for optional fields ───────────────────────

  it('should treat empty string SENTRY_DSN as undefined', () => {
    const result = envSchema.parse({ ...VALID_ENV, SENTRY_DSN: '' });
    expect(result.SENTRY_DSN).toBeUndefined();
  });
});
