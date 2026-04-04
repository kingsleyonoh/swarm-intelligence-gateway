import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local for test environment
// This provides DATABASE_URL, REDIS_URL, and other config for local dev services
config({ path: resolve(process.cwd(), '.env.local') });
