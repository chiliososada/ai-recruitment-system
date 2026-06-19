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

- **Forward-only, numbered** SQL in `supabase/migrations/` (through the highest-numbered
  file — currently `0012`), applied in numeric order, recorded in `ars_schema_migrations`;
  the runner is idempotent (already-applied files are skipped). **No down-migrations** —
  reverse a change with a *new* numbered migration.
- **Do not** apply `supabase/local/bootstrap.sql` to Supabase — it is local-only
  (recreates `auth`/`storage`/roles that Supabase provides natively).
- **Run order on Supabase:** enable the `vector` extension (migration `0001` runs
  `create extension if not exists vector`; ensure the project allows it), then apply
  migrations `0001 → 0012`. Migration `0010` creates the private `resumes` bucket +
  policies; `0011` adds the additive `job_queue` table; `0012` adds an additive
  talent-search index.

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

## Data retention & account deletion (detailed)

This expands the summary above with the exact PII inventory, the real foreign-key
behavior (including the constraints that **block** a naive delete), and a step-by-step
operator procedure. It is derived from the migrations in `supabase/migrations/` and the
schema map in [DATABASE.md](DATABASE.md). For data classification see
[SECURITY.md](SECURITY.md).

### What personal data is stored (and where)

| Data | Location | Notes |
| ---- | -------- | ----- |
| **Email + login credentials** | **Auth (GoTrue), not the app DB** | `profiles` holds **no** email. On Supabase the email/password live in `auth.users`; locally in the `auth.local_identities` shim. Deleting app rows alone does **not** remove the login. |
| **Display name, locale, role** | `profiles` (`profiles.id == auth user id`) | Minimal identity. |
| **Candidate profile** | `candidates` | Headline, summary, location, years of experience, languages, desired salary range. 1:1 with `profiles` via unique `user_id`. |
| **Résumé file metadata** | `resume_files` | Filename, MIME, size, `scan_result`, **`extracted_text`** (full parsed résumé text — sensitive), and the `storage_path`. |
| **Résumé bytes** | **Storage** (private `resumes` bucket), *not* the DB | Path `<owner_user_id>/<unguessable-uuid>.<ext>`. Locally under `LOCAL_STORAGE_DIR` (default `.storage`). |
| **Extracted skills** | `candidate_skills`, `skill_analyses` | `skill_analyses.result` is the full validated AI-analysis JSON. |
| **Candidate embedding** | `candidate_embeddings` | `vector(384)` derived from résumé/profile text. |
| **Messages** | `messages` (`sender_user_id`), `conversations` (`created_by`), `conversation_members` | Free-text message bodies are personal content. |
| **Notifications** | `notifications` (`user_id`) | Titles/bodies may reference personal activity. |
| **Recruitment activity** | `applications`, `application_stage_history` (`changed_by`), `interviews` (`proposed_by`), `matches`/`match_results` | Application/stage/interview history tied to the candidate and to acting users. |
| **Company-curated data** | `shortlists` (`created_by`), `candidate_comparisons` (`created_by`) | Owned by a **company**, not an individual — shared data; see below. |

> Company rows (`companies`, `jobs`, `job_skills`) are **organizational**, not personal.
> They are not deleted by an individual account-deletion request.

### How deletion actually cascades (verified against the FKs)

Deleting the **candidate aggregate** cascades cleanly. `candidates.user_id` is
`on delete cascade` from `profiles`, and these all cascade from `candidates`:
`resume_files` → `parse_jobs`; `candidate_skills`; `skill_analyses`;
`candidate_embeddings`; `matches`/`match_results`; `applications` →
(`application_stage_history`, `interviews`); and `shortlists` / `candidate_comparisons`
rows that reference the candidate. So removing the `candidates` row removes the
seeker's candidate-side data.

**The catch — these columns reference `profiles(id)` with _no_ `on delete` action
(default `NO ACTION`/RESTRICT), so deleting a `profiles` row while any of them exist
fails with a foreign-key violation:**

| Table.column | Created by |
| ------------ | ---------- |
| `conversations.created_by` | starting a conversation |
| `messages.sender_user_id` | sending a message |
| `application_stage_history.changed_by` | advancing an application's stage |
| `interviews.proposed_by` | proposing an interview |
| `shortlists.created_by` | shortlisting a candidate |
| `candidate_comparisons.created_by` | saving a comparison |

(`conversation_members.user_id` and `notifications.user_id` **do** cascade from
`profiles`.) In practice an active user — especially a recruiter who has messaged,
moved applications, proposed interviews, or shortlisted — has authored rows that
**must be handled first** (re-assign/anonymize or delete them) before the `profiles`
row can be removed. There is no `on delete set null` or anonymization built into the
schema for these "actor" columns; an operator resolves them explicitly.

### There is no self-service deletion

**Account deletion is operator-only.** The API exposes `PATCH /auth/account` for a user
to change their own **display name, locale, and password** (`apps/api/src/routes/auth.ts`)
— and nothing else: there is **no** delete/deactivate/anonymize endpoint and no
self-serve "delete my account" UI. A user requesting erasure must be handled by an
operator following the procedure below. (If self-service erasure becomes a requirement,
it needs new endpoints/UI and a resolution strategy for the RESTRICT'd actor columns
above — it does not exist today.)

### Operator deletion procedure

Run against the production DB (`DATABASE_URL`) / Supabase dashboard. Do this inside a
**transaction** and keep the BYPASSRLS `service_role` / direct DB access for it. Capture
who/when for the audit trail before starting.

1. **Identify the subject.** Auth user id `== profiles.id`. Find the `candidate.id`
   (seekers: `select id from candidates where user_id = :uid`) and any
   `company_members` rows (`select company_id, role from company_members where user_id = :uid`).
2. **Delete résumé objects from Storage** (these do **not** cascade from the DB).
   Remove every object under the user's folder `<uid>/…` in the `resumes` bucket via the
   Supabase Storage API / dashboard. Cross-check against
   `select storage_path from resume_files where candidate_id = :cid` so none are orphaned.
3. **Resolve authored "actor" rows** that would block the `profiles` delete (see the
   table above). Per policy, either:
   - **Delete** them (e.g. the user's `messages`, their `application_stage_history`
     entries, `interviews` they proposed, `conversations` they created,
     `shortlists`/`candidate_comparisons` they created), **or**
   - **Re-assign/anonymize** them to a retained "deleted user" / company-service
     principal where the audit record must be preserved (e.g. stage history). Company
     data (shortlists/comparisons/jobs) is shared — decide whether to transfer ownership
     to another company member or remove it.
4. **Delete the candidate row** (seekers): `delete from candidates where id = :cid;` —
   this cascades away résumé metadata, parse jobs, skills, analyses, embedding, matches,
   and applications (with their stage history and interviews).
5. **Remove company membership** if applicable: `delete from company_members where user_id = :uid;`
   (decide separately what happens to company-owned data — it is not personal).
6. **Delete the profile**: `delete from profiles where id = :uid;` — with steps 3–5 done,
   the cascading children (`conversation_members`, `notifications`) go too and no
   RESTRICT constraint remains.
7. **Delete the auth user** so the email/login is gone: remove the user in **Supabase
   Auth** (dashboard or the GoTrue admin API). The app has no endpoint that deletes an
   auth user, so this is a deliberate manual step.
8. **Verify & record.** Confirm: no `resume_files`/`storage` objects remain for the
   user, `select count(*) from profiles where id = :uid` is 0, the auth user is gone, and
   `/ready` still returns `200`. Record the deletion (subject, operator, timestamp,
   scope) for audit/compliance.

> Order matters: storage → authored/actor rows → candidate → membership → profile →
> auth user. Skipping step 3 will make step 6 fail with a foreign-key error.

### Retention guidance

- **Résumé text & analyses** (`resume_files.extracted_text`, `skill_analyses`): the most
  sensitive at-rest PII. Define a retention window for inactive candidates and prune (or
  delete on request) per policy.
- **Queue rows** (`job_queue`): prune `succeeded` rows periodically, and review/retire
  `dead` rows (they may carry payload context) to bound table growth.
- **Audit/history** (`application_stage_history`): append-only by design; retain per
  policy, anonymizing the actor on erasure rather than dropping the record where an audit
  trail is required.
- **Reference data** (`skills`, `algorithm_versions`, seed): non-personal — retained
  permanently.

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
