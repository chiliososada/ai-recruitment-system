# Architecture

System architecture of the AI Recruitment System: a TypeScript monorepo whose whole
stack — real Postgres with `pgvector`, RLS, AI analysis, embeddings, and virus
scanning — runs locally with zero external credentials via deterministic mocks and an
in-process database, and runs against real Supabase + Anthropic/OpenAI by flipping
environment variables.

Related docs: [API.md](API.md), [AI.md](AI.md), [DATABASE.md](DATABASE.md),
[SECURITY.md](SECURITY.md), [OPERATIONS.md](OPERATIONS.md), [RUNBOOK.md](RUNBOOK.md).

---

## System overview

```
   Browser ──HTTPS──▶ SPA (React/Vite, static)
       │                 served by nginx/CDN
       │  Authorization: Bearer <app JWT>
       ▼
   Node API (Fastify 5, @ars/api)  ── stateless, horizontally scalable
       │   adapters (swappable per runtime):
       │   auth · token · storage · virus scan · LLM · embeddings · metrics
       │
       ├──▶ Postgres + pgvector (Supabase)   ── RLS per request, durable job_queue
       ├──▶ Object storage (private bucket)  ── résumé bytes
       └──▶ Providers: Anthropic / OpenAI / ClamAV  ── wrapped in resilience

   Background worker (in-process, runs with the API) drains the Postgres job queue:
   résumé text extraction → LLM skill analysis → embedding.
```

The same code runs in two runtimes selected by `ARS_RUNTIME` (see below). External
concerns sit behind **swappable adapters** whose production implementation and
deterministic test mock share one interface, which prevents drift and keeps the full
test suite credential-free.

---

## Monorepo layout (npm workspaces)

```
ai-recruitment-system/
├── apps/
│   ├── web/   @ars/web    React 18 + Vite SPA (TanStack Query, react-i18next)
│   └── api/   @ars/api    Fastify 5 API + swappable adapters
│       └── src/  app.ts (server build) · server.ts (boot + graceful shutdown)
│                 config.ts (env) · deps.ts (adapter wiring) · resilience.ts
│                 jobs/queue.ts (durable queue) · observability/metrics.ts
│                 adapters/ (auth, storage, ai, embeddings, scan, …)
├── packages/
│   └── shared/  @ars/shared  Zod DTOs/schemas, enums, error envelope, pagination,
│                             prompt-safety helpers, versioned scoring algorithm
├── supabase/
│   ├── migrations/   0001…0011 forward-only SQL (schema, indexes, RLS, storage, queue)
│   ├── local/bootstrap.sql  LOCAL-ONLY auth/storage shim + roles
│   └── seed.sql      non-sensitive reference seed (skill dictionary)
├── infra/docker/     Dockerfile.api · Dockerfile.web · nginx.conf · docker-compose.yml
├── scripts/          verify.mjs · scan-security.mjs · check-bundle.mjs
└── docs/             this documentation
```

`@ars/shared` is the single source of truth for request/response DTOs, enums, the error
envelope, pagination, prompt-safety helpers, and the versioned scoring algorithm; both
apps depend on it, preventing client/server type drift.

---

## The two runtimes (`ARS_RUNTIME`)

The API selects concrete adapters at boot from one switch (`apps/api/src/deps.ts`,
driven by `config.ts`):

| `ARS_RUNTIME` | Database | Auth | Storage | LLM / Embeddings | Virus scan | Credentials |
| ------------- | -------- | ---- | ------- | ---------------- | ---------- | ----------- |
| `local` (default) | In-process PGlite Postgres (+ pgvector) | Local bcrypt + credential table | Filesystem | Deterministic mock | Mock (flags EICAR) | **None** |
| `supabase` | Supabase Postgres via `pg` pool | Supabase Auth (GoTrue) | Supabase Storage | Anthropic / OpenAI | clamd (ClamAV) | Required |

The **same** SQL migrations run on both. On local PGlite, `supabase/local/bootstrap.sql`
first recreates the pieces a real Supabase project provides (the `auth`/`storage`
schemas, helper functions, and the `authenticated`/`anon`/`service_role` roles), then
the canonical migrations apply. On real Supabase only `supabase/migrations/*` apply.

---

## Request lifecycle

Every API request flows through the same pipeline (`apps/api/src/app.ts`):

1. **Correlation id** — each request gets an id (`req.id`), echoed on every response as
   `x-correlation-id` and attached to all logs for end-to-end tracing.
2. **Security middleware** — helmet (strict CSP for the JSON/SSE API, security
   headers), CORS allowlist (`WEB_ORIGIN`), global rate limit (300 req/min/IP outside
   tests), multipart limits (`MAX_UPLOAD_BYTES`, single file).
3. **Authentication** — an `onRequest` hook resolves the `Authorization: Bearer` token
   to a `principal` (`userId`, `email`, `role`, `emailVerified`) via `tokens.verify`;
   absent/invalid → `principal = null` (no throw). Cookie-free, so CSRF is low-risk.
4. **Metrics** — an `onResponse` hook records `http_requests_total{method,status,route}`
   and `http_request_duration{route}` with a low-cardinality route label.
5. **Handler + DB / RLS context** — the route handler runs queries through a connection
   helper that opens a transaction and runs `SET LOCAL ROLE authenticated|anon` plus
   `SET LOCAL request.jwt.claims = <payload>`, so **RLS policies enforce ownership and
   tenancy in the database** (defense-in-depth alongside service-layer role checks).
   Service-side authorized writes that must bypass RLS use the `service_role`.
6. **Validation & errors** — inputs validated with Zod; a unified `ApiError` envelope
   is returned. Postgres RLS `WITH CHECK` violations (`42501`) map to `403 FORBIDDEN`;
   Zod errors → `VALIDATION`; rate-limit → `RATE_LIMITED`; upstream provider failures →
   `UPSTREAM_AI_ERROR`; otherwise `INTERNAL`.

See [API.md](API.md) for the endpoint catalog and envelope/pagination conventions, and
[DATABASE.md](DATABASE.md) for the full RLS model.

---

## Durable job queue

Résumé processing (extraction → LLM skill analysis → embedding) is offloaded from the
HTTP request to a **Postgres-backed durable queue** (`supabase/migrations/0011_job_queue.sql`,
worker in `apps/api/src/jobs/queue.ts`; decision ID-2). The external behavior of résumé
upload (FR-02) is unchanged — the queue drives the existing `parse_jobs` status.

- **States:** `queued → running → succeeded`, or `→ dead` (dead-letter) after exhausting
  attempts. (`queue_job_status` enum.)
- **Claim / lease:** the worker claims ready jobs with
  `... where status='queued' and run_after <= now() order by run_after FOR UPDATE SKIP LOCKED`,
  flips them to `running`, increments `attempts`, and records `locked_at`/`locked_by` —
  so multiple workers/instances never double-process a job.
- **Backoff:** on failure, `run_after = now() + min(maxBackoff, baseBackoff * 2^(attempts-1))`
  (exponential, capped). Each attempt has a timeout (default 30s).
- **Dead-letter:** when `attempts >= max_attempts` (default 5) the job becomes `dead`
  with its `last_error` retained for inspection.
- **Crash recovery:** a reaper requeues jobs stuck in `running` past the lease
  (default 60s), so a crashed worker's in-flight jobs are recovered.
- **Idempotency:** an optional `idempotency_key` (unique) de-dupes concurrent/duplicate
  enqueues (`on conflict do nothing`, returning the existing job).
- **Observability:** `stats()` reports depth per status, exposed at `/metrics` as
  `job_queue_depth{status=...}`.
- **Execution mode (ID-3):** in prod the worker runs continuously
  (`deps.jobs.start()`), `JOBS_INLINE=false`; in local/test the same code path can drain
  inline for deterministic assertions (explicit flag, not a mock). The queue table is
  worker-only — no `authenticated`/`anon` grants; only `service_role` touches it.

Scaling guidance for workers is in [OPERATIONS.md](OPERATIONS.md).

---

## Provider resilience

External provider calls (LLM, embeddings, virus scan) are wrapped by
`withResilience(fn, {timeout, retries, breaker})` (`apps/api/src/resilience.ts`,
decision ID-4):

- **Timeout** per attempt; **bounded retries** with exponential backoff.
- **Circuit breaker** (`closed → open → half_open`): after `threshold` consecutive
  failures the breaker **opens** and calls fail fast with `CircuitOpenError` (no partial
  side effects), mapped to `UPSTREAM_AI_ERROR`. After a `cooldown` it half-opens and
  probes recovery, closing on success.
- The virus scanner **fails closed** — a scan error rejects the upload rather than
  storing it unscanned.
- Combined with the queue's backoff/dead-letter, provider outages degrade safely:
  HTTP requests aren't blocked, and résumé jobs resume when the provider recovers.

AI provider interfaces, the structured analysis schema, embeddings, the scoring
formula, and prompt-injection/privacy defenses are documented in [AI.md](AI.md).

---

## Observability

- **Logs:** structured pino logs with centralized PII redaction; every line carries the
  request `correlationId`. Trace a request across API → worker → DB by correlation id.
- **Metrics:** a vendor-neutral `Metrics`/`Tracer` adapter (decision ID-5,
  `apps/api/src/observability/metrics.ts`) with a local no-op/console implementation and
  an OpenTelemetry-ready one behind `METRICS_PROVIDER`. Exposed at `GET /metrics`
  (Prometheus text format): request rate/latency/status, `job_queue_depth`, and provider
  metrics.
- **Health/readiness:** `GET /health` (liveness, static) vs `GET /ready` (real DB check,
  `503` when a dependency is down) — see [OPERATIONS.md](OPERATIONS.md).
- **Version traceability:** `/health` reports `version`/`commit` (`APP_VERSION`/`GIT_COMMIT`).
- **Graceful shutdown:** on SIGTERM/SIGINT the server stops accepting requests, drains
  in-flight queue jobs, closes the DB pool, then exits (15s force-exit backstop) —
  relied on by the container deployment.

---

## Database & RLS model (reference)

PostgreSQL with `pgvector`, defined by forward-only numbered migrations
(`supabase/migrations/0001…0011`) that run identically on Supabase and PGlite.
Authorization is enforced **at the database** by Row Level Security
(`0009_rls.sql`): three roles (`anon`, `authenticated`, `service_role`),
`SECURITY DEFINER` helper functions for ownership/membership, and per-table read/write
policies covering cross-role / cross-tenant / IDOR — all exercised by RLS negative
tests (`npm run test:rls`). Embeddings use `vector(384)` columns with `ivfflat`
(`vector_cosine_ops`) indexes; matching is versioned (`match-v1`). Full schema,
relationships, RLS table, and storage policies are in [DATABASE.md](DATABASE.md).
