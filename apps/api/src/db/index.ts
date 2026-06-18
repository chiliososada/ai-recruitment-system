import path from 'node:path';
import type { AppConfig } from '../config.js';
import { applyMigrations } from './migrate.js';
import { PgPoolDb } from './pg.js';
import { PgliteDb } from './pglite.js';
import type { Db } from './types.js';

export * from './types.js';
export { applyMigrations } from './migrate.js';
export { PgliteDb } from './pglite.js';

/**
 * Build the DB for the configured runtime. For `supabase`, returns a pooled `pg`
 * connection (migrations are applied out-of-band via the Supabase CLI). For `local`,
 * returns in-process PGlite and applies bootstrap + migrations (+ reference seed for dev).
 */
export async function createDb(config: AppConfig): Promise<Db> {
  if (config.ARS_RUNTIME === 'supabase') {
    if (!config.DATABASE_URL) throw new Error('DATABASE_URL required for supabase runtime');
    return PgPoolDb.create(config.DATABASE_URL);
  }

  const dataDir = config.NODE_ENV === 'test' ? undefined : path.join(process.cwd(), '.pglite');
  const db = await PgliteDb.create(dataDir);
  await applyMigrations(db, { bootstrap: true, seed: config.NODE_ENV !== 'test' });
  return db;
}
