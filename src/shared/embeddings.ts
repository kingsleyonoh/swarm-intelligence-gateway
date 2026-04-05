import { pipeline } from '@xenova/transformers';

import { createChildLogger } from './logger.js';

/**
 * Embedding service — generates 384-dimension sentence embeddings using
 * `@xenova/transformers` with the `all-MiniLM-L6-v2` ONNX model.
 *
 * Runs entirely in-process: the model weights (~25MB) are downloaded on
 * first use and cached by `@xenova/transformers`. No external API calls
 * are made after the initial warm-up, making this suitable for batch
 * workloads inside BullMQ workers.
 *
 * Used by the custom graph store (`src/memory/graph-store.ts`) to
 * produce vectors for nodes and agent episodes that are then stored
 * in pgvector columns for semantic similarity search.
 */

const log = createChildLogger({ module: 'embeddings' });

/** HuggingFace model identifier for the ONNX-exported MiniLM model. */
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/** Output vector dimensionality — must match the pgvector `VECTOR(384)` columns. */
export const EMBEDDING_DIMENSIONS = 384;

/**
 * The pipeline returned by `@xenova/transformers` is callable with
 * `(text, options)` and returns a Tensor-like object with a `.data`
 * Float32Array. We use a structural type rather than the library's
 * exported class because that class is constructor-internal.
 */
type ExtractorFn = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

/** Cached extractor instance — initialized lazily on first embedding request. */
let extractor: ExtractorFn | null = null;

/** Guard against concurrent initialization (multiple callers during startup). */
let extractorInitPromise: Promise<ExtractorFn> | null = null;

/**
 * Lazily initialize the embedding pipeline.
 *
 * The first call downloads and loads the model weights, which can take
 * several seconds. Subsequent calls return the cached instance immediately.
 * Concurrent first-callers share the same initialization promise to
 * avoid double-loading the model.
 */
export async function getExtractor(): Promise<ExtractorFn> {
  if (extractor) {
    return extractor;
  }
  if (extractorInitPromise) {
    return extractorInitPromise;
  }

  extractorInitPromise = (async () => {
    log.info({ model: MODEL_NAME }, 'Loading embedding model...');
    // `pipeline` is typed loosely by the library; we cast to our
    // structural callable type for ergonomic call sites.
    const loaded = (await pipeline('feature-extraction', MODEL_NAME)) as unknown as ExtractorFn;
    extractor = loaded;
    log.info({ model: MODEL_NAME }, 'Embedding model loaded');
    return loaded;
  })();

  try {
    return await extractorInitPromise;
  } finally {
    extractorInitPromise = null;
  }
}

/**
 * Generate a 384-dimension embedding for the given text.
 *
 * - Uses mean pooling across tokens and L2-normalizes the output vector,
 *   which is the recommended configuration for all-MiniLM-L6-v2 when
 *   computing cosine similarity (pgvector `<=>` operator).
 * - Rejects empty or whitespace-only input to prevent storing meaningless
 *   zero-vectors that would distort similarity rankings.
 *
 * @throws Error if the input is empty or the model inference fails.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const extract = await getExtractor();
  const output = await extract(text, { pooling: 'mean', normalize: true });
  // Convert the Float32Array to a plain number[] so it serializes
  // cleanly through Drizzle's custom `vector` type and across
  // JSON boundaries (BullMQ job payloads, test assertions, etc.).
  return Array.from(output.data);
}

/**
 * Reset the cached extractor — for test isolation only.
 *
 * Do not call this from production code. Tests use it in `beforeEach`
 * to verify lazy-initialization semantics without leaking state across
 * test cases.
 */
export function resetExtractorForTesting(): void {
  extractor = null;
  extractorInitPromise = null;
}
