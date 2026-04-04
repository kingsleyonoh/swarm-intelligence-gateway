import { z } from 'zod';

/**
 * Transform empty strings to undefined so optional fields
 * with empty values in .env files are treated as absent.
 */
const optionalString = z
  .string()
  .optional()
  .transform((val) => (val === '' ? undefined : val));

/**
 * Coerce string "true"/"false" to boolean with a default value.
 *
 * Uses `z.preprocess` so the coercion runs even when
 * the value is supplied by `.default()` in the parent schema.
 * (In Zod v4, `.transform().pipe().default()` inserts the raw default
 * without running the transform pipeline.)
 */
function booleanWithDefault(defaultValue: boolean) {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return val;
    },
    z.boolean().default(defaultValue),
  );
}

/**
 * Zod schema for all environment variables.
 *
 * Groups:
 * - Required: DATABASE_URL, REDIS_URL
 * - Required with defaults: PORT, NODE_ENV, LOG_LEVEL, numbers, booleans
 * - Optional strings: external service URLs, tokens, secrets
 */
export const envSchema = z.object({
  // ── Required ──────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // ── Required with defaults (numeric) ──────────────────────────────
  PORT: z.coerce.number().int().positive().default(3000),
  POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  DEFAULT_AGENT_COUNT: z.coerce.number().int().positive().default(4096),
  DEFAULT_ROUND_COUNT: z.coerce.number().int().positive().default(5),
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // ── Required with defaults (enum / string) ────────────────────────
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z
    .string()
    .default('info'),

  // ── Required with defaults (boolean) ──────────────────────────────
  SELF_REGISTRATION_ENABLED: booleanWithDefault(true),
  NOTIFICATION_HUB_ENABLED: booleanWithDefault(false),
  DEMO_MODE: booleanWithDefault(false),

  // ── Optional strings ──────────────────────────────────────────────
  WORLDMONITOR_REDIS_URL: optionalString,
  WORLDMONITOR_REDIS_TOKEN: optionalString,
  MIROFISH_API_URL: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  NOTIFICATION_HUB_URL: optionalString,
  NOTIFICATION_HUB_API_KEY: optionalString,
  WEBHOOK_SECRET: optionalString,
  SENTRY_DSN: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment configuration.
 *
 * Parsed once at startup from `process.env`.
 * Import this from anywhere that needs config values.
 */
export const env: Env = envSchema.parse(process.env);
