/**
 * Seed script — creates a default tenant if none exist.
 *
 * Usage: npm run setup
 * (Runs via: tsx src/scripts/setup.ts)
 *
 * Idempotent: if tenants already exist, prints a message and exits.
 */
import crypto from 'node:crypto';

import { count } from 'drizzle-orm';

import { db, closeDb } from '../shared/db.js';
import { tenants } from '../db/schema/tables.js';
import { logger } from '../shared/logger.js';

async function main(): Promise<void> {
  const log = logger.child({ module: 'setup' });

  try {
    // Check if any tenants exist
    const [result] = await db.select({ total: count() }).from(tenants);

    if (result.total > 0) {
      log.info({ tenantCount: result.total }, 'Tenants already exist — skipping seed');
      console.log('\n  Already initialized. %d tenant(s) exist.\n', result.total);
      return;
    }

    // Generate API key
    const apiKey = `sig_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Create default tenant
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Default', apiKeyHash })
      .returning({ id: tenants.id, name: tenants.name });

    log.info({ tenantId: tenant.id }, 'Default tenant created');

    console.log('\n  ┌─────────────────────────────────────────────────────┐');
    console.log('  │  Default tenant created                              │');
    console.log('  ├─────────────────────────────────────────────────────┤');
    console.log('  │  Tenant ID: %s   │', tenant.id);
    console.log('  │  Name:      %s                              │', tenant.name);
    console.log('  ├─────────────────────────────────────────────────────┤');
    console.log('  │  API Key (save this — shown only once):             │');
    console.log('  │  %s │', apiKey);
    console.log('  └─────────────────────────────────────────────────────┘\n');
  } catch (error) {
    log.error(error, 'Setup failed');
    console.error('\n  Setup failed. See logs above.\n');
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main();
