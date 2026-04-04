import { describe, it, expect } from 'vitest';

import { logger, createChildLogger } from '../../src/shared/logger.js';

describe('logger', () => {
  it('should be a Pino logger instance', () => {
    // Pino loggers have these core methods
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.fatal).toBe('function');
    expect(typeof logger.trace).toBe('function');
  });

  it('should have the configured log level', () => {
    // From .env.local, LOG_LEVEL should be set (default: 'info')
    expect(typeof logger.level).toBe('string');
    expect(logger.level.length).toBeGreaterThan(0);
  });

  it('should include service name in base bindings', () => {
    // Pino stores base bindings; we can check via child or serialization
    // The logger.bindings() method returns the bindings
    const bindings = logger.bindings();
    expect(bindings).toHaveProperty('service', 'swarm-gateway');
  });

  it('should support child logger creation via logger.child()', () => {
    const child = logger.child({ module: 'test' });

    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');

    const childBindings = child.bindings();
    expect(childBindings).toHaveProperty('module', 'test');
  });
});

describe('createChildLogger', () => {
  it('should return a Pino logger with specified bindings', () => {
    const child = createChildLogger({ module: 'poller', tenantId: 'abc' });

    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');

    const bindings = child.bindings();
    expect(bindings).toHaveProperty('module', 'poller');
    expect(bindings).toHaveProperty('tenantId', 'abc');
  });

  it('should inherit the parent log level', () => {
    const child = createChildLogger({ module: 'test-child' });
    expect(child.level).toBe(logger.level);
  });

  it('should produce independent children (changing one does not affect another)', () => {
    const child1 = createChildLogger({ module: 'child1' });
    const child2 = createChildLogger({ module: 'child2' });

    const bindings1 = child1.bindings();
    const bindings2 = child2.bindings();

    expect(bindings1.module).toBe('child1');
    expect(bindings2.module).toBe('child2');
    expect(bindings1.module).not.toBe(bindings2.module);
  });
});
