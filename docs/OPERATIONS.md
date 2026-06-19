# Operations

Operating the AI Recruitment System in shared environments (staging / production).
Covers the environment matrix, migrations, health/readiness/metrics, scaling, data
retention & deletion, backup/restore, and SLI/SLO + alerting. For deployment
mechanics see [DEPLOY.md](DEPLOY.md); for incident procedures see [RUNBOOK.md](RUNBOOK.md).

Production runs three pieces: the **SPA** (static), the **Node API** (`@ars/api`,
`ARS_RUNTIME=supabase`), and **Supabase** (Postgres + Auth + Storage). The API is
stateless; the durable job queue lives in Postgres.

---

## Environment variable matrix

Authoritative source: `apps/api/src/config.ts` (defaults in parentheses). Set on the
**API** host unless marked build-time (SPA). "staging" and "prod" differ mainly in
which secrets/origins are used, not in which variables exist.

| Variable | Staging | Prod | Notes |
| -------- | ------- | ---- | ----- |
| `NODE_ENV` | `production` | `production` | Enables boot guards + HSTS. |
| `ARS_RUNTIME` | `supabase` | `supabase` | `local` is dev/test only. |
| `API_PORT` (`4000`) / `API_HOST` (`127.0.0.1`) | set | set | Bind `0.0.0.0` in containers. |
| `WEB_ORIGIN` (`http://localhost:5173`) | staging SPA origin(s) | prod SPA origin(s) | CORS allowlist, comma-separated. |
| `LOCAL_JWT_SECRET` (dev placeholder) | strong unique | strong unique | Signs app JWTs; **default rejected in prod**. |
| `MAX_UPLOAD_BYTES` (`10485760`) | 10 MB | 10 MB | Upload cap. |
| `DATABASE_URL` (—) | staging DB | prod DB | **Required** for `supabase`. TLS. |
| `LOCAL_STORAGE_DIR` (`.storage`) | n/a | n/a | Local runtime only. |
| `SUPABASE_URL` (—) | staging | prod | Project URL. |
| `SUPABASE_ANON_KEY` (—) | staging | prod | Public anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` (—) | staging | prod | **BYPASSRLS** — top-tier secret. |
| `SUPABASE_JWT_SECRET` (—) | staging | prod | Verifies Supabase Auth tokens. |
| `SUPABASE_STORAGE_BUCKET` (`resumes`) | `resumes` | `resumes` | Private bucket. |
| `AI_PROVIDER` (`mock`) | `anthropic`/`openai` | `anthropic`/`openai` | **Not `mock`** in shared envs. |
| `ANTHROPIC_API_KEY` (—) / `ANTHROPIC_MODEL` (`claude-opus-4-8`) | if anthropic | if anthropic | |
| `EMBEDDING_PROVIDER` (`mock`) | `openai` | `openai` | |
| `EMBEDDING_DIMENSIONS` (`384`) | `384` | `384` | **Must match** the `vector(384)` columns. |
| `OPENAI_API_KEY` (—) / `OPENAI_EMBEDDING_MODEL` (`text-embedding-3-small`) | if openai | if openai | |
| `VIRUS_SCANNER` (`mock`) | `clamav` | `clamav` | **`mock` rejected** in prod+supabase. |
| `CLAMAV_HOST` (`127.0.0.1`) / `CLAMAV_PORT` (`3310`) | clamd addr | clamd addr | INSTREAM. |
| `LOG_LEVEL` (`info`) | `info` | `info`/`warn` | pino level. |
| `JOBS_INLINE` (unset→`false` for supabase) | `false` | `false` | Background worker in prod; inline only for local/test determinism. |
| `METRICS_PROVIDER` (`noop`) | `console`/`otel` | `otel` | Observability backend. |
| `APP_VERSION` (`0.1.0`) / `GIT_COMMIT` (`dev`) | set | set | Surfaced on `/health` for traceability. |
| `VITE_API_BASE_URL` (`http://localhost:4000`) | staging API origin | prod API origin | **Build-time, SPA.** Baked in; rebuild to change. |
| `VITE_DEFAULT_LOCALE` (`ja`) | `ja` | `ja` | Build-time, SPA. |

**Boot guards** (fail fast): `VIRUS_SCANNER=mock` rejected when
`NODE_ENV=production` + `ARS_RUNTIME=supabase`; default `LOCAL_JWT_SECRET` rejected in
prod; `ARS_RUNTIME=supabase` requires `DATABASE_URL`.

---

## Migrations

- **Forward-only, numbered** SQL in `supabase/migrations/0001…0011`, applied in numeric
  order, recorded in `ars_schema_migrations`; the runner is idempotent (already-applied
  files are skipped). **No down-migrations** — reverse a change with a *new* numbered
  migration.
- **Do not** apply `supabase/local/bootstrap.sql` to Supabase — it is local-only
  (recreates `auth`/`storage`/roles that Supabase provides natively).
- **Run order on Supabase:** enable the `vector` extension (migration `0001` runs
  `create extension if not exists vector`; ensure the project allows it), then apply
  migrations `0001 → 0011`. Migration `0010` creates the private `resumes` bucket +
  policies; `0011` adds the additive `job_queue` table.

How to run:

```bash
# Validate the full set locally first (bootstrap + migrations + seed on PGlite;
# asserts pgvector + ivfflat + RLS present):
npm run db:migrate:check

# Apply to Supabase (either):
supabase db push
# or each file in order:
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Deploy ordering: ship a backward-compatible schema **before/with** the API that needs
it; roll back in reverse order so the running API and schema never disagree.

---

## Health, readiness, and metrics

| Endpoint | Purpose | Probe use | Behavior |
| -------- | ------- | --------- | -------- |
| `GET /health` | Liveness | Orchestrator **liveness** probe | Always `200` `{status:"ok", runtime, version, commit, uptime}` while the process is up. Static — does NOT check the DB. |
| `GET /ready` | Readiness | LB / orchestrator **readiness** probe; container `HEALTHCHECK` | Runs a real `select 1` against the DB. `200 {status:"ready"}` only when dependencies pass; `503 {status:"not_ready", checks}` otherwise. Use this to gate traffic. |
| `GET /metrics` | Metrics | Prometheus scrape | `text/plain; version=0.0.4` exposition. Includes job-queue depth gauges (`job_queue_depth{status=...}`), request rate/latency (`http_requests_total`, `http_request_duration`), and provider metrics. Never fails the scrape. |

Use `/ready` (not `/health`) to decide whether an instance should receive traffic —
`/health` staying green during a DB outage is intentional (keeps the process from being
killed while it waits to recover). Every response carries `x-correlation-id` for
log correlation.

---

## Scaling

- **API is stateless** — scale horizontally behind a load balancer. No sticky
  sessions (bearer tokens, not server-side session state). Liveness `/health`,
  readiness `/ready`.
- **Background workers** — the durable queue is **Postgres-backed** and claims jobs
  with `FOR UPDATE SKIP LOCKED`, so you can run **N** API instances (each runs the
  worker via `deps.jobs.start()`) or dedicated worker processes; they will not
  double-process a job. Scale workers with résumé-parse/analysis throughput. In prod,
  `JOBS_INLINE=false` (background); inline draining is for local/test determinism only.
- **Database** — the scaling ceiling. Watch connection count (size the `pg` pool to
  stay within Postgres/Supabase limits across all instances), `job_queue` depth, and
  pgvector recall query latency. Add read replicas / connection pooling (PgBouncer)
  before vertically maxing out.
- **Providers** — Anthropic/OpenAI/clamd are external dependencies with their own
  rate limits; the resilience wrapper (timeout/retry/breaker) and the queue's backoff
  absorb transient slowness. Increase worker concurrency only within provider limits.

---

## Data retention, deletion & account deletion

Most lifecycle actions today are **operations-only** (run by an operator against the
DB / Supabase) — there is no self-service account-deletion UI; do not assume one.

- **Cascade model:** foreign keys cascade from the owning aggregate. Deleting a
  `candidate` removes its `resume_files`, `parse_jobs`, `candidate_skills`,
  `skill_analyses`, and embedding; deleting a `profile`/auth user cascades accordingly
  (see the relationship map in [DATABASE.md](DATABASE.md)).
- **Résumé bytes** live in Storage separately from DB rows. Account deletion must
  delete **both** the DB rows **and** the storage objects under the user's folder
  (`<owner_uid>/…`).

**Account-deletion operational procedure (ops-only):**

1. Identify the user: auth user id == `profiles.id`; find the `candidate.id` (if a
   seeker) and any `company_members` rows.
2. Delete résumé objects from the `resumes` bucket under the user's `auth.uid()`
   folder (Supabase Storage API / dashboard).
3. Delete the candidate / profile rows (DB cascade removes dependent rows). For a
   company member, decide whether to remove just the membership or transfer/close
   company-owned data (jobs, shortlists) first — company data is shared, not personal.
4. Delete the auth user (Supabase Auth) so the email/login is removed.
5. Verify: the user's résumés are gone from storage, dependent rows are gone, and
   `/ready` still returns ready. Record the action (who/when) for audit.

- **Retention:** define per-class retention (e.g. inactive-candidate résumé text,
  dead-letter `job_queue` rows) per policy; prune dead/`succeeded` queue rows
  periodically to bound table growth. Reference seed/skill data is permanent.

---

## Backup & restore

- **Supabase Point-in-Time Recovery (PITR):** the primary recovery path — roll the
  database back to just before a bad change or data loss. Enable it on the project.
- **Logical dumps:** take periodic `pg_dump` snapshots for portability / off-platform
  backup; restore with `pg_restore`/`psql` into a fresh database, then re-point
  `DATABASE_URL`.
- **Storage:** back up the `resumes` bucket per the storage provider's mechanism;
  DB rows reference storage paths, so DB and storage backups should be coordinated.
- **Restore validation:** after any restore, run `npm run db:migrate:check` against a
  copy to confirm `pgvector` + `ivfflat` + RLS are intact, and verify `/ready`.
  Detailed restore steps are in [RUNBOOK.md](RUNBOOK.md).

---

## SLI / SLO suggestions

Starting targets — tune against observed baselines (see [PERFORMANCE.md](PERFORMANCE.md)).
Measure from the metrics exposed at `/metrics`.

| SLI | Definition (source) | Suggested SLO | Suggested alert threshold |
| --- | ------------------- | ------------- | ------------------------- |
| **Availability** | Fraction of API requests not 5xx (`http_requests_total` by status) | 99.5% / 30 days | Page if 5xx rate > 2% over 5 min; warn > 1% over 15 min. |
| **Latency (p95)** | API request duration p95 (`http_request_duration`) | p95 < 500 ms (read paths) | Warn p95 > 750 ms 10 min; page p95 > 1.5 s 10 min. |
| **Job success rate** | `succeeded / (succeeded + dead)` for `job_queue` | ≥ 99% | Page if `dead` count rises > 0 sustained, or success < 95% / 1 h. |
| **Queue backlog** | `job_queue_depth{status="queued"}` + oldest `run_after` age | backlog drains < 5 min | Warn depth > 100 for 10 min; page oldest queued > 15 min. |
| **Parse success rate** | Résumé parse jobs reaching `succeeded` vs `dead` | ≥ 98% | Warn < 95% / 1 h. |
| **Readiness** | `/ready` returning 200 | n/a (probe) | Page on `/ready` 503 sustained > 2 min (DB unreachable). |
| **Provider health** | Circuit-breaker open events / upstream errors (provider metrics) | breaker closed | Warn on breaker `open`; page if open > 5 min (provider outage). |

Record actual measured baselines in [PERFORMANCE.md](PERFORMANCE.md) before committing
to SLO numbers.
