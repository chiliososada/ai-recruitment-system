# Runbook

Incident runbooks for the AI Recruitment System. Each entry has a **detection
signal**, **diagnosis** steps, **mitigation**, and **rollback**. For the env matrix,
health endpoints, and SLO/alert thresholds see [OPERATIONS.md](OPERATIONS.md); for
deploy/rollback mechanics see [DEPLOY.md](DEPLOY.md).

**Common tools used throughout:**

- **Health/readiness:** `GET /health` (liveness, static), `GET /ready` (DB-checked;
  `503` when a dependency is down).
- **Metrics:** `GET /metrics` — `http_requests_total{status}`, `http_request_duration`,
  `job_queue_depth{status}`, provider/breaker metrics.
- **Logs:** structured (pino). Every request/response carries `x-correlation-id`; pivot
  on a `correlationId` to trace a single request across API → worker → DB. PII is
  redacted — search by ids/correlation ids, not payloads.

General first 5 minutes: confirm scope (one instance vs all), check `/ready` and the
5xx rate, identify the most recent change (deploy / migration / provider status), and
grab a correlation id from a failing request.

---

## 1. API down / unreachable

- **Detection:** `/health` unreachable or connection refused; availability SLO burn
  (5xx or no response); LB shows all targets unhealthy.
- **Diagnosis:**
  1. Is the process up? Check orchestrator/container status and recent restarts
     (crash-loop?). `/health` is static — if even it fails, the process isn't serving.
  2. Recent deploy? Check `APP_VERSION`/`GIT_COMMIT` on `/health` (if reachable on one
     instance) and the deploy log.
  3. Boot guard failure? Logs show a refuse-to-start error (mock scanner in prod,
     default `LOCAL_JWT_SECRET`, missing `DATABASE_URL`). See [OPERATIONS.md].
  4. Resource exhaustion (OOM/CPU)? Check container metrics.
- **Mitigation:** restart/scale the API; if a bad deploy, roll back to the previous
  image/build; if a boot-guard/env error, fix the env var and redeploy; if DB is the
  root cause, follow §2.
- **Rollback:** redeploy the previous API artifact/image tag (API is stateless; safe
  and immediate). Confirm `/health` then `/ready` are green.

---

## 2. Database unreachable / degraded

- **Detection:** `/ready` returns `503 {checks:{database:"fail"}}`; logs show
  connection/pool errors; latency spikes then 5xx.
- **Diagnosis:**
  1. `/ready` confirms the DB check is failing. Verify `DATABASE_URL` and Supabase
     project status (maintenance? incident?).
  2. Connection limit hit? Sum the `pg` pool size across all API instances vs the
     Postgres/Supabase max — too many instances can exhaust connections.
  3. Network/TLS path between API and DB.
- **Mitigation:** restore connectivity (provider) or reduce pressure (scale API down
  to fit connection limits, add PgBouncer); the worker backs off and the queue is
  durable, so jobs resume when the DB returns. Traffic is gated by `/ready`, so
  instances won't receive requests until the DB is back.
- **Rollback:** if a recent migration caused it, see §5; otherwise no app rollback
  needed — recover the DB and let `/ready` flip back to ready.

---

## 3. Job-queue backlog / dead-letter growth

- **Detection:** `job_queue_depth{status="queued"}` rising / oldest `run_after`
  aging; `job_queue_depth{status="dead"}` > 0 or climbing; parse/analysis SLO burn.
- **Diagnosis:**
  1. Inspect the queue:
     ```sql
     select status, count(*) from job_queue group by status;
     select id, kind, attempts, max_attempts, last_error, run_after
       from job_queue where status in ('dead','running')
       order by updated_at desc limit 50;
     ```
  2. **Backlog** (many `queued`, few `running`): not enough worker throughput, or
     workers stopped — check that API/worker instances are up and `JOBS_INLINE=false`.
  3. **Dead-letter** (rising `dead`): repeated handler failures — read `last_error`.
     Common cause: provider outage (§4) or malformed input. Note jobs hit `dead` after
     `attempts >= max_attempts` (default 5) with exponential backoff between tries.
  4. **Stuck `running`:** a crashed worker; rows past the lease (default 60s) are
     auto-requeued by the reaper — confirm it's progressing.
- **Mitigation:** for backlog, scale out workers/API instances (queue is
  `SKIP LOCKED`-safe). For dead-letter from a transient cause, fix the cause then
  re-queue the dead rows (e.g. set `status='queued', attempts=0, run_after=now()` for
  the affected ids after confirming the root cause is resolved). For poison messages,
  leave them dead and fix the handler/input.
- **Rollback:** if a deploy changed a handler and caused failures, roll back the API;
  previously-dead jobs can then be re-queued.

---

## 4. Provider (LLM / embedding / scanner) outage

- **Detection:** errors mapped to `UPSTREAM_AI_ERROR`; circuit-breaker **open** events
  in metrics/logs; analysis/embedding jobs failing/retrying; parse success-rate drop.
- **Diagnosis:**
  1. Check provider status (Anthropic/OpenAI) and the breaker state in metrics. The
     resilience wrapper applies a **timeout + bounded retries (exponential backoff)**;
     after N consecutive failures the **breaker opens** and calls fail fast with
     `CircuitOpenError` → `UPSTREAM_AI_ERROR` (no partial side effects). After a
     cooldown it moves to `half_open` and probes recovery.
  2. Confirm which provider: AI (`AI_PROVIDER`), embeddings (`EMBEDDING_PROVIDER`), or
     virus scanner (ClamAV). A failing scanner **fails closed** — uploads are rejected
     rather than stored unscanned.
  3. Auth/quota? Check for 401/429 from the provider (key rotated? rate limited?).
- **Mitigation:** the system degrades safely — affected résumé jobs stay in the queue
  with backoff and resume when the breaker closes; HTTP requests aren't blocked. If the
  outage is prolonged, wait it out (jobs are durable) or fail over to the alternate
  provider where configured (`anthropic`↔`openai` for analysis; embeddings are
  OpenAI-only — keep `EMBEDDING_DIMENSIONS` consistent). For a scanner outage, fix
  clamd connectivity; do not disable scanning in prod (boot guard forbids `mock`).
- **Rollback:** if triggered by a config/key change, restore the prior key/config and
  redeploy; the breaker closes once calls succeed.

---

## 5. Failed migration / bad schema change

- **Detection:** migration step errors during deploy; post-deploy `/ready` 503 or 5xx
  referencing missing/changed columns; `db:migrate:check` failing in CI.
- **Diagnosis:**
  1. Identify the offending migration and how far it got (`ars_schema_migrations`
     records applied files; the runner is idempotent and skips applied ones).
  2. Determine whether it partially applied (some DDL committed). Migrations are
     **forward-only** — there is no down-migration.
- **Mitigation / rollback:**
  1. **App/schema mismatch:** roll the API back to the version compatible with the
     current schema first (stateless redeploy), to stop errors.
  2. **Reverse the change:** ship a **new** numbered migration that undoes it — never
     edit an already-applied migration file.
  3. **Data corruption / unrecoverable partial apply:** restore the database via
     Supabase **PITR** to just before the migration (see §7), then re-apply the
     corrected migration set.
  4. **Verify:** run `npm run db:migrate:check` against a copy (asserts pgvector +
     ivfflat + RLS), then confirm `/ready` is green.

---

## 6. High error rate

- **Detection:** 5xx ratio over threshold (`http_requests_total{status=5xx}`); latency
  p95 breach; user reports.
- **Diagnosis:**
  1. Scope by route/status from `/metrics` (low-cardinality `route` label) to find the
     concentrated failure.
  2. Pull a failing request's `correlationId` and trace it through the logs to the
     stack/cause. Note the error envelope code (`VALIDATION`, `FORBIDDEN` from RLS
     `42501`, `RATE_LIMITED`, `UPSTREAM_AI_ERROR`, `INTERNAL`).
  3. Correlate with recent deploys, a DB issue (§2), or a provider outage (§4).
  4. Sudden `RATE_LIMITED` spike → abusive client / scraping (global limit
     300 req/min/IP).
- **Mitigation:** roll back a bad deploy (§1); address the dependency (§2/§4); block or
  throttle an abusive source. If `INTERNAL` from a single code path, hotfix + redeploy.
- **Rollback:** previous API artifact; verify error rate returns to baseline.

---

## 7. Restore from backup

- **When:** data loss/corruption, an unrecoverable failed migration (§5), or a
  destructive operational mistake.
- **Procedure:**
  1. **Decide the target point** (just before the bad change) and freeze writes if
     feasible (scale the API down so the worker stops writing).
  2. **Restore the database:**
     - **PITR (preferred):** roll the Supabase project back to the chosen timestamp.
     - **Logical dump:** restore the latest `pg_dump` into a fresh database with
       `pg_restore`/`psql`, then point `DATABASE_URL` at it.
  3. **Restore storage** (`resumes` bucket) to a coordinated point so DB rows and their
     storage paths agree.
  4. **Validate:** run `npm run db:migrate:check` against a copy of the restored
     schema (pgvector + ivfflat + RLS present); bring the API back up; confirm
     `/health` then `/ready` are green; spot-check a known record and a résumé download.
  5. **Resume traffic** and monitor error rate, queue depth, and latency.
- **Rollback of the restore:** keep the pre-restore snapshot until the restore is
  verified, so you can revert if the restore target was wrong.

---

## Escalation & postmortem

- Page on SLO-breach thresholds in [OPERATIONS.md](OPERATIONS.md). Escalate provider
  outages to the provider's status/support; DB/platform issues to Supabase.
- After resolution, write a **blameless postmortem**: timeline (with correlation ids),
  detection signal, root cause, what worked, detection/mitigation gaps, and concrete
  follow-up actions (with owners). Feed regressions back into tests
  (unit/integration/RLS) and, where relevant, new alerts.
