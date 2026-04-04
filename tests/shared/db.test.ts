import { describe, it, expect } from 'vitest';

import { db, closeDb } from '../../src/shared/db.js';

describe('db module', () => {
  it('should export a Drizzle ORM instance', () => {
    expect(db).toBeDefined();
    // Drizzle instances have a `select` method
    expect(typeof db.select).toBe('function');
  });

  it('should export a closeDb function', () => {
    expect(typeof closeDb).toBe('function');
  });

  it('should have query execution methods on the db instance', () => {
    // Drizzle ORM instances expose these core methods
    expect(typeof db.insert).toBe('function');
    expect(typeof db.update).toBe('function');
    expect(typeof db.delete).toBe('function');
  });

  it('should have execute method for raw SQL', () => {
    expect(typeof db.execute).toBe('function');
  });
});
