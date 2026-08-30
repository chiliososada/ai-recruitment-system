#!/usr/bin/env bash
# Apply supabase/migrations/*.sql to the recruit db container, tracked in
# ars_schema_migrations (mirrors apps/api/src/db/migrate.ts). Idempotent.
# NEVER applies supabase/local/bootstrap.sql (local-runtime only).
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
MIG_DIR="../../../supabase/migrations"

# Prefer the image superuser (needed to own storage.objects policies in 0010).
PSQL_USER=supabase_admin
if ! $COMPOSE exec -T db psql -U "$PSQL_USER" -d postgres -qAt -c 'select 1' >/dev/null 2>&1; then
  PSQL_USER=postgres
fi
run() { $COMPOSE exec -T db psql -U "$PSQL_USER" -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
val() { $COMPOSE exec -T db psql -U "$PSQL_USER" -d postgres -qAt -c "$1"; }
echo "migrating as db user: $PSQL_USER"

# Wait for the storage schema (created by storage-api's own migrations) —
# migration 0010 adds bucket + policies on storage.objects.
for i in $(seq 1 60); do
  [ "$(val "select count(*) from information_schema.schemata where schema_name='storage'")" = "1" ] && break
  [ "$i" = "60" ] && { echo "ERROR: storage schema never appeared (is recruit-storage healthy?)"; exit 1; }
  sleep 2
done

run -c "create table if not exists ars_schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);"
# The app pool connects as postgres and switches roles per request.
run -c "grant anon, authenticated, service_role to postgres;"

applied=0 skipped=0
for f in "$MIG_DIR"/*.sql; do
  base="$(basename "$f")"
  if [ "$(val "select count(*) from ars_schema_migrations where name='$base'")" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "  applying $base"
  run -1 -f - <"$f"
  run -c "insert into ars_schema_migrations (name) values ('$base') on conflict do nothing;"
  applied=$((applied + 1))
done
echo "MIGRATIONS OK — applied=$applied skipped=$skipped total=$(val 'select count(*) from ars_schema_migrations')"
