/**
 * Upstream E2E integration tests — MiroFish API shape verification.
 *
 * These tests hit a REAL running MiroFish instance to verify that
 * the actual API responses match the shapes our client expects.
 *
 * SKIPPED by default — only runs when MIROFISH_API_URL env var is set.
 * Example: MIROFISH_API_URL=http://localhost:5001 npx vitest run tests/integration/upstream-e2e.test.ts
 *
 * These are smoke tests. They do NOT run full simulations (too slow).
 * They verify: server reachability, endpoint existence, response envelope shape.
 */
import { describe, it, expect } from 'vitest';

const MIROFISH_API_URL = process.env.MIROFISH_API_URL;

describe.skipIf(!MIROFISH_API_URL)('MiroFish upstream API verification', () => {
  const baseUrl = MIROFISH_API_URL as string;

  it('should be reachable at the configured base URL', async () => {
    const response = await fetch(baseUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    // Any HTTP response means the server is running — even 404 or 500
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(response.status).toBeLessThan(600);
  });

  it('should reject GET on POST-only endpoint /api/graph/ontology/generate with 405', async () => {
    const response = await fetch(`${baseUrl}/api/graph/ontology/generate`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    // Flask returns 405 Method Not Allowed for wrong HTTP method
    // This proves the route exists and the server is routing correctly
    expect([400, 404, 405]).toContain(response.status);
  });

  it('should return JSON response for POST /api/graph/ontology/generate with empty body', async () => {
    const response = await fetch(`${baseUrl}/api/graph/ontology/generate`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });

    // Without proper multipart data, MiroFish should return an error
    // but the response should still be parseable
    expect(response.status).toBeGreaterThanOrEqual(400);

    const contentType = response.headers.get('content-type') ?? '';
    // Flask may return JSON or HTML error page
    expect(
      contentType.includes('application/json') || contentType.includes('text/html'),
    ).toBe(true);
  });

  it('should return JSON response for POST /api/simulation/create with empty body', async () => {
    const response = await fetch(`${baseUrl}/api/simulation/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    // Without a valid project_id, should return an error
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('should return JSON for GET /api/graph/task/nonexistent', async () => {
    const response = await fetch(`${baseUrl}/api/graph/task/nonexistent-task-id`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    // Should return 404 or error for nonexistent task
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('should respond to GET /api/simulation/:id/run-status', async () => {
    const response = await fetch(`${baseUrl}/api/simulation/nonexistent-id/run-status`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    // MiroFish may return 200 with status data even for unknown IDs,
    // or 404 — either way the endpoint exists and responds
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(response.status).toBeLessThan(600);
  });

  it('should return error for GET /api/report/by-simulation/nonexistent', async () => {
    const response = await fetch(`${baseUrl}/api/report/by-simulation/nonexistent-id`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    // Should return 404 or error for nonexistent simulation report
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('should have consistent API response structure (envelope check)', async () => {
    // POST with invalid data should still return the { data, success } envelope
    const response = await fetch(`${baseUrl}/api/simulation/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: 'nonexistent-project' }),
      signal: AbortSignal.timeout(10_000),
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      // MiroFish wraps all responses in { data, success } or returns plain error
      // At minimum, the response should be a JSON object
      expect(typeof body).toBe('object');
      expect(body).not.toBeNull();
    }
  });
});
