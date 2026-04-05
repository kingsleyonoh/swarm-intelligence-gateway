import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────────

/**
 * Mock `@xenova/transformers` — this is an EXTERNAL library we do not
 * own. Mocking is appropriate per coding standards (Live Integration
 * Testing policy: "Don't Mock What You Own"). The real model download
 * is ~50MB and slow, making unmocked tests unsuitable for CI.
 *
 * The mock returns a deterministic 384-dim vector so consistency
 * and dimension assertions remain meaningful.
 */
const mocks = vi.hoisted(() => {
  const extractorCall = vi.fn(async (_text: string, _opts: unknown) => ({
    data: new Float32Array(384).fill(0.1),
  }));
  const pipelineFactory = vi.fn(async () => extractorCall);
  return { extractorCall, pipelineFactory };
});

vi.mock('@xenova/transformers', () => ({
  pipeline: mocks.pipelineFactory,
}));

// Silence logger output during tests
vi.mock('../../src/shared/logger.js', () => {
  const noop = vi.fn();
  const childLogger = { info: noop, warn: noop, error: noop, debug: noop };
  return {
    logger: { ...childLogger, child: vi.fn().mockReturnValue(childLogger) },
    createChildLogger: vi.fn().mockReturnValue(childLogger),
  };
});

// Import after mocks
const { generateEmbedding, getExtractor, EMBEDDING_DIMENSIONS, resetExtractorForTesting } =
  await import('../../src/shared/embeddings.js');

// ── Tests ───────────────────────────────────────────────────────────

describe('embeddings module', () => {
  beforeEach(() => {
    mocks.extractorCall.mockClear();
    mocks.pipelineFactory.mockClear();
    resetExtractorForTesting();
  });

  describe('EMBEDDING_DIMENSIONS constant', () => {
    it('should export 384 as the embedding dimension', () => {
      expect(EMBEDDING_DIMENSIONS).toBe(384);
    });
  });

  describe('getExtractor', () => {
    it('should lazily initialize the pipeline on first call', async () => {
      expect(mocks.pipelineFactory).not.toHaveBeenCalled();
      await getExtractor();
      expect(mocks.pipelineFactory).toHaveBeenCalledTimes(1);
    });

    it('should request the feature-extraction task with all-MiniLM-L6-v2 model', async () => {
      await getExtractor();
      expect(mocks.pipelineFactory).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
      );
    });

    it('should cache the extractor across calls (only initialize once)', async () => {
      await getExtractor();
      await getExtractor();
      await getExtractor();
      expect(mocks.pipelineFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateEmbedding', () => {
    it('should produce a 384-dimension vector for valid text', async () => {
      const embedding = await generateEmbedding('Hello, world!');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384);
    });

    it('should return values as plain numbers (not Float32Array)', async () => {
      const embedding = await generateEmbedding('Test text');
      expect(embedding).toBeInstanceOf(Array);
      for (const value of embedding) {
        expect(typeof value).toBe('number');
      }
    });

    it('should return consistent output for the same input', async () => {
      const a = await generateEmbedding('Same input text');
      const b = await generateEmbedding('Same input text');
      expect(a).toEqual(b);
    });

    it('should call the extractor with mean pooling and normalization', async () => {
      await generateEmbedding('A piece of text');
      expect(mocks.extractorCall).toHaveBeenCalledWith(
        'A piece of text',
        expect.objectContaining({ pooling: 'mean', normalize: true }),
      );
    });

    it('should throw an error for empty string input', async () => {
      await expect(generateEmbedding('')).rejects.toThrow(/empty/i);
    });

    it('should throw an error for whitespace-only input', async () => {
      await expect(generateEmbedding('   \n\t  ')).rejects.toThrow(/empty/i);
    });

    it('should propagate errors from the underlying extractor', async () => {
      mocks.extractorCall.mockRejectedValueOnce(new Error('Model inference failed'));
      await expect(generateEmbedding('Valid text')).rejects.toThrow('Model inference failed');
    });

    it('should only initialize the extractor once across multiple calls', async () => {
      await generateEmbedding('first');
      await generateEmbedding('second');
      await generateEmbedding('third');
      expect(mocks.pipelineFactory).toHaveBeenCalledTimes(1);
    });

    it('should invoke the extractor once per generateEmbedding call', async () => {
      await generateEmbedding('alpha');
      await generateEmbedding('beta');
      expect(mocks.extractorCall).toHaveBeenCalledTimes(2);
    });
  });
});
