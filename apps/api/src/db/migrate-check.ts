/**
 * Migration validation (gate #11, T-077). Applies bootstrap + all migrations + seed to a
 * FRESH in-process Postgres and asserts the expected schema materialized. Exit 0 on success.
 */
import { applyMigrations } from './migrate.js';
import { PgliteDb } from './pglite.js';

const EXPECTED_TABLES = [
  'profiles',
  'candidates',
  'resume_files',
  'parse_jobs',
  'skills',
  'candidate_skills',
  'skill_analyses',
  'companies',
  'company_members',
  'jobs',
  'job_skills',
  'algorithm_versions',
  'candidate_embeddings',
  'job_embeddings',
  'match_results',
  'conversations',
  'conversation_members',
  'messages',
  'notifications',
  'applications',
  'application_stage_history',
  'shortlists',
  'candidate_comparisons',
  'interviews',
  'job_queue',
];

async function main(): Promise<void> {
  const db = await PgliteDb.create();
  const ran = await applyMigrations(db, {
    bootstrap: true,
    seed: true,
    logger: (m) => console.log('  •', m),
  });

  const tables = await db.service((c) =>
    c.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    ),
  );
  const present = new Set(tables.rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));

  // Verify pgvector extension + an ivfflat index exist.
  const vector = await db.service((c) =>
    c.query<{ count: number }>(
      `select count(*)::int as count from pg_extension where extname = 'vector'`,
    ),
  );
  const ivf = await db.service((c) =>
    c.query<{ count: number }>(
      `select count(*)::int as count from pg_indexes where indexname like '%_ivf'`,
    ),
  );
  // Verify RLS is enabled on a representative protected table.
  const rls = await db.service((c) =>
    c.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where relname = 'applications'`,
    ),
  );

  await db.close();

  const problems: string[] = [];
  if (missing.length) problems.push(`missing tables: ${missing.join(', ')}`);
  if ((vector.rows[0]?.count ?? 0) < 1) problems.push('pgvector extension not installed');
  if ((ivf.rows[0]?.count ?? 0) < 2) problems.push('expected ivfflat vector indexes missing');
  if (!rls.rows[0]?.relrowsecurity) problems.push('RLS not enabled on applications');

  if (problems.length) {
    console.error('MIGRATION_CHECK: FAIL');
    for (const p of problems) console.error('  -', p);
    process.exit(1);
  }
  console.log(
    `MIGRATION_CHECK: OK — ${ran.length} migrations, ${present.size} public tables, pgvector + ivfflat + RLS verified`,
  );
}

main().catch((err) => {
  console.error('MIGRATION_CHECK: ERROR', err);
  process.exit(2);
});
