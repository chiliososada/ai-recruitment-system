import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './types.js';

// migrate.{ts,js} lives at apps/api/{src,dist}/db; repo root is four levels up.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const SUPABASE_DIR = process.env.ARS_SUPABASE_DIR ?? path.join(repoRoot, 'supabase');
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, 'migrations');
const BOOTSTRAP_SQL = path.join(SUPABASE_DIR, 'local', 'bootstrap.sql');
const SEED_SQL = path.join(SUPABASE_DIR, 'seed.sql');

export interface MigrateOptions {
  /** Apply the local-only auth/storage shim first (PGlite). Default true. */
  bootstrap?: boolean;
  /** Apply supabase/seed.sql after migrations. Default false. */
  seed?: boolean;
  logger?: (message: string) => void;
}

/** Apply bootstrap (optional) + any not-yet-applied migrations + seed (optional). Idempotent. */
export async function applyMigrations(db: Db, opts: MigrateOptions = {}): Promise<string[]> {
  const log = opts.logger ?? (() => {});

  if (opts.bootstrap !== false && existsSync(BOOTSTRAP_SQL)) {
    await db.exec(await readFile(BOOTSTRAP_SQL, 'utf8'));
    log('applied local bootstrap.sql');
  }

  await db.exec(
    `create table if not exists ars_schema_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     );`,
  );

  const applied = new Set<string>();
  await db.service(async (c) => {
    const r = await c.query<{ name: string }>('select name from ars_schema_migrations');
    for (const row of r.rows) applied.add(row.name);
  });

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.exec(sql);
    await db.exec(
      `insert into ars_schema_migrations (name) values ('${file}') on conflict do nothing;`,
    );
    ran.push(file);
    log(`applied ${file}`);
  }

  if (opts.seed && existsSync(SEED_SQL)) {
    await db.exec(await readFile(SEED_SQL, 'utf8'));
    log('applied seed.sql');
  }

  return ran;
}
