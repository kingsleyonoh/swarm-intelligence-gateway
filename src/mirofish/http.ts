import { request } from 'undici';

import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger({ module: 'mirofish-http' });
const RETRYABLE_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET']);

export interface HttpRetryOptions {
  maxRetries: number;
  retryBaseDelayMs: number;
}

export type MirofishRequestOptions = NonNullable<Parameters<typeof request>[1]>;

function isRetryableError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTTP adapter shared by the MiroFish pipeline, polling, and data readers. */
export async function requestWithRetry<T>(
  url: string,
  options: MirofishRequestOptions,
  retry: HttpRetryOptions,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retry.maxRetries; attempt++) {
    try {
      const response = await request(url, options);
      if (response.statusCode >= 400) {
        const body = await response.body.text();
        throw new Error(`MiroFish API error: ${response.statusCode} — ${body}`);
      }
      return await response.body.json() as T;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      lastError = error;
      if (!isRetryableError(error) || attempt === retry.maxRetries - 1) throw error;

      const delayMs = retry.retryBaseDelayMs * 2 ** attempt;
      log.warn(
        { url, attempt: attempt + 1, maxRetries: retry.maxRetries, delayMs },
        'Retrying MiroFish request after connection error',
      );
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('MiroFish request failed after all retries');
}
