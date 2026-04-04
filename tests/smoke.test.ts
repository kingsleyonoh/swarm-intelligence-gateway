import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('should have DATABASE_URL configured', () => {
    expect(process.env.DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toContain('postgresql://');
  });

  it('should have REDIS_URL configured', () => {
    expect(process.env.REDIS_URL).toBeDefined();
    expect(process.env.REDIS_URL).toContain('redis://');
  });

  it('should have NODE_ENV configured', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('should have app config variables loaded', () => {
    expect(process.env.PORT).toBeDefined();
    expect(process.env.LOG_LEVEL).toBeDefined();
  });
});
