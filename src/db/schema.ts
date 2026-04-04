/**
 * Barrel re-export for Drizzle schema.
 *
 * Tables are defined in `schema/tables.ts`, relations in `schema/relations.ts`.
 * This file exists so that `drizzle.config.ts` (which points to `./src/db/schema.ts`)
 * and application code can import from a single path.
 */
export * from './schema/tables.js';
export * from './schema/relations.js';
