import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js';

/** Validates a UUID v4 string. */
export const uuidSchema = z.string().uuid();

/** Optional UUID cursor for pagination. */
export const cursorSchema = z.string().uuid().optional();

/**
 * Cursor-based pagination parameters.
 *
 * - `cursor`: UUID of the last item from the previous page (optional)
 * - `limit`: page size, 1..100, defaults to 20
 */
export const paginationSchema = z.object({
  cursor: cursorSchema,
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/** Validates a non-empty trimmed string. */
export const nonEmptyStringSchema = z.string().trim().min(1);

/** Validates a positive integer (useful for agent_count, round_count, etc.). */
export const positiveIntSchema = z.coerce.number().int().positive();

/**
 * Validates a confidence value: decimal between 0 and 1 inclusive.
 */
export const confidenceSchema = z.coerce.number().min(0).max(1);
