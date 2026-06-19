# Deployment

Production runs three pieces: the **SPA** (static files), the **Node API** (`@ars/api`), and
**Supabase** (Postgres + Auth + Storage). The API runs with `ARS_RUNTIME=supabase` and real AI /
embedding / virus-scan providers.

Build everything first:

```bash
npm ci
npm run build
```

This produces `apps/web/dist` (SPA) and `apps/api/dist` (API).

---

## Deploy procedure (ordered)

Do these in order on a fresh deploy. Each numbered step links to its detailed section below.
**Schema-before-app:** apply a backward-compatible database state **before/with** the API that
depends on it, and roll back in the reverse order, so the running API and the schema never disagree.

1. **Pre-flight (CI gate).** On the release commit: `npm ci`, run the quality gates
   (`node scripts/verify.mjs`), `node scripts/scan-security.mjs` (green), and archive an SBOM
   (`node scripts/gen-sbom.mjs`). Validate the migration set with `npm run db:migrate:check`.
2. **Provision Supabase / Postgres** and collect the URL, anon key, service-role key, JWT secret,
   and `DATABASE_URL`. Enable the `vector` extension. → [§1](#1-supabase-setup)
3. **Apply migrations** in numeric order through the highest-numbered file (`0001…` —
   `0011` introduces the `job_queue` table; any later additive migrations apply after it) via
   `supabase db push` or psql; confirm the private `resumes` bucket (`0010`) exists. Do **not**
   apply `supabase/local/bootstrap.sql`. → [§1](#1-supabase-setup)
4. **Set the production env vars** (see the table below) from a secret manager — including the boot
   guards (`NODE_ENV=production`, `ARS_RUNTIME=supabase`, a strong `LOCAL_JWT_SECRET`,
   `VIRUS_SCANNER=clamav`, `DATABASE_URL`). → [env table](#required-environment-variables-production)
5. **Provision ClamAV** (`clamd`) and confirm `CLAMAV_HOST`/`CLAMAV_PORT` are reachable from the API.
   → [§2](#2-node-api)
6. **Build/deploy the API** image and start it (background worker drains the queue with
   `JOBS_INLINE=false`). → [§2](#2-node-api)
7. **Verify readiness:** `GET /ready` returns `200` (`/health` is liveness only). Gate traffic on
   `/ready`. Confirm `/metrics` scrapes and `/health` shows the expected `version`/`commit`.
8. **Build the SPA** with `VITE_API_BASE_URL` set to the API origin (baked in at build time) and
   deploy `apps/web/dist` to the static host/CDN with SPA fallback. Ensure the nginx CSP
   `connect-src` includes the API origin. → [§3](#3-spa-static)
9. **Post-deploy smoke test:** run one company and one job-seeker journey end-to-end (register,
   upload a résumé → parse/analysis completes via the queue, see recommendations/ranked matches).
10. **Confirm operations:** backups / PITR enabled, logs shipping with PII redaction, metrics +
    alerts wired (see [OPERATIONS.md](OPERATIONS.md)).

---

## 1. Supabase setup

1. **Create a project** (or use a self-hosted Supabase / Postgres). Note the project URL, anon key,
   service-role key, JWT secret, and the database connection string.
2. **Enable the `vector` extension.** Migration `0001` runs `create extension if not exists vector`;
   ensure your project allows it (Supabase: Database → Extensions → enable `vector`).
3. **Apply migrations in numeric order** — every file in `supabase/migrations/` from `0001`
   through the highest-numbered one. Do **not** apply `supabase/local/bootstrap.sql` (it is
   local-only; Supabase already provides `auth`/`storage` and the roles). For example:

   ```bash
   supabase db push
   # or apply each file in order with psql:
   # for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```

4. **Storage bucket:** migration `0010` creates the private `resumes` bucket and its RLS policies.
   Confirm the bucket exists and matches `SUPABASE_STORAGE_BUCKET`.
5. **Durable job queue:** migration `0011` adds the `job_queue` table (résumé parse/analysis run
   through it). It is service-role-only — no `authenticated`/`anon` grants — and additive.
6. *(Optional)* apply `supabase/seed.sql` for the reference skill dictionary.

Validate the migration set locally before deploying:

```bash
npm run db:migrate:check
```

---

## 2. Node API

Run the compiled server:

```bash
node apps/api/dist/server.js
```

It binds to `API_HOST:API_PORT` (bind `0.0.0.0` in containers) and logs
`API listening on … (runtime=supabase)`.

- **Liveness:** `GET /health` → `{ "status": "ok", "runtime", "version", "commit", "uptime" }`.
  Always `200` while the process is up (does **not** check the DB). Point the orchestrator
  **liveness** probe here.
- **Readiness:** `GET /ready` runs a real `select 1` against the DB — `200` when ready,
  `503` otherwise. Point the **readiness** / load-balancer probe (and the container
  `HEALTHCHECK`) here, so an instance only receives traffic once its DB is reachable. The
  `infra/docker/Dockerfile.api` HEALTHCHECK already curls `/ready`.
- **Metrics:** `GET /metrics` (Prometheus exposition) — request rate/latency, provider
  metrics, and `job_queue_depth` gauges; never fails the scrape.
- **OpenAPI:** `GET /openapi.json`.
- **CORS:** set `WEB_ORIGIN` to the SPA's deployed origin(s), comma-separated.
- **Uploads:** capped by `MAX_UPLOAD_BYTES` (default 10 MB).
- **Job queue / workers:** keep `JOBS_INLINE=false` (the default for `supabase`) so the
  Postgres-backed queue drains via a background worker; you may run multiple API instances
  and/or dedicated workers (jobs are claimed `FOR UPDATE SKIP LOCKED`). See
  [OPERATIONS.md](OPERATIONS.md) for scaling.
- **Graceful shutdown:** the server handles SIGTERM/SIGINT — stops accepting connections,
  drains in-flight queue jobs, closes the DB pool, then exits. Send SIGTERM (the container
  CMD runs `node` as PID 1) and allow a drain window before SIGKILL.

### Boot-time guards

The API refuses to start with insecure production configuration:

- `VIRUS_SCANNER=mock` is rejected when `NODE_ENV=production` + `ARS_RUNTIME=supabase` — configure a
  real scanner (ClamAV).
- the default `LOCAL_JWT_SECRET` is rejected in production.
- `ARS_RUNTIME=supabase` requires `DATABASE_URL`.

### Virus scanning (ClamAV)

Set `VIRUS_SCANNER=clamav` and point `CLAMAV_HOST` / `CLAMAV_PORT` (default `127.0.0.1:3310`) at a
reachable `clamd` instance. The adapter streams uploads over the INSTREAM protocol.

### Run as a container (recommended)

`infra/docker/Dockerfile.api` builds a production image (build context is the **repo root**):

```bash
docker build -f infra/docker/Dockerfile.api -t ars-api .
docker run -d --name ars-api -p 4000:4000 --env-file ./api.env ars-api
```

The image is `node:20-slim`, runs as the non-root `node` user, ships the compiled `dist` +
`supabase/` migrations, and has a `HEALTHCHECK` that curls `/ready`. Inject the env vars below from
your secret manager (`--env-file` / orchestrator secrets) — never bake secrets into the image.
`infra/docker/docker-compose.yml` can bring up a real Postgres + pgvector and (under the `apps`
profile) the `api`/`web` images together; see the README "Docker & docker-compose" section.

`apps/web/dist` is a static build — serve it from any static host or CDN (Netlify, Vercel static,
S3 + CloudFront, Nginx, etc.) with SPA fallback routing (serve `index.html` for unknown routes).

The API base URL is baked in at **build time** via `VITE_API_BASE_URL`, so set it before
`npm run build` (it cannot be changed without rebuilding):

```bash
VITE_API_BASE_URL=https://api.example.com VITE_DEFAULT_LOCALE=ja npm run build
```

---

## Required environment variables (production)

Authoritative source: `apps/api/src/config.ts`. Set on the **API** host (unless noted as build-time
for the SPA). For the full staging-vs-prod matrix see [OPERATIONS.md](OPERATIONS.md).

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NODE_ENV` | yes | `production` (enables boot guards + HSTS) |
| `ARS_RUNTIME` | yes | `supabase` |
| `API_PORT` / `API_HOST` | recommended | API bind address (bind `0.0.0.0` in containers) |
| `WEB_ORIGIN` | yes | SPA origin(s), comma-separated (CORS allowlist) |
| `LOCAL_JWT_SECRET` | yes | Strong secret signing app-issued JWTs (default is rejected in prod) |
| `MAX_UPLOAD_BYTES` | optional | Default 10 MB (`10485760`) |
| `RATE_LIMIT_MAX` | optional | Global req/min/IP ceiling (default `300`) |
| `DATABASE_URL` | yes | Postgres connection string (TLS) |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key — **BYPASSRLS**, top-tier secret |
| `SUPABASE_JWT_SECRET` | yes | Verifies Supabase Auth tokens |
| `SUPABASE_STORAGE_BUCKET` | optional | Default `resumes` |
| `AI_PROVIDER` | yes | `anthropic` (or `openai`) — not `mock` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | if `anthropic` | API key / model (`claude-opus-4-8`) |
| `EMBEDDING_PROVIDER` | yes | `openai` |
| `EMBEDDING_DIMENSIONS` | optional | Default `384` (must match the `vector(384)` columns) |
| `OPENAI_API_KEY` / `OPENAI_EMBEDDING_MODEL` | if `openai` | API key / model |
| `VIRUS_SCANNER` | yes | `clamav` (mock is rejected in prod+supabase) |
| `CLAMAV_HOST` / `CLAMAV_PORT` | if `clamav` | clamd address (default `127.0.0.1:3310`) |
| `LOG_LEVEL` | optional | pino level (default `info`) |
| `JOBS_INLINE` | optional | Queue drain mode; default `false` for `supabase` (background worker) |
| `METRICS_PROVIDER` | optional | `noop` (default) / `console` / `otel` |
| `APP_VERSION` / `GIT_COMMIT` | recommended | Surfaced on `/health` for traceability |
| `VITE_API_BASE_URL` | yes (build-time, SPA) | API base URL baked into the SPA |
| `VITE_DEFAULT_LOCALE` | optional (build-time, SPA) | Default `ja` |

Never commit real secrets, tokens, résumés, or PII.

---

## Rollback procedure

1. **Application (API + SPA):** redeploy the previous build artifacts (previous `apps/api/dist` and
   `apps/web/dist` / image tag). Both are stateless apart from the database, so reverting the
   binaries is safe and immediate.
2. **Database:** migrations are forward-only (no down-migrations). To undo a schema change, ship a
   **new** numbered migration that reverses it — do not edit a migration that has already been
   applied.
3. **Data corruption / failed migration:** restore the database from a backup. On Supabase use
   **Point-in-Time Recovery** to roll back to just before the change; alternatively re-apply the
   full numbered migration set to a fresh database and restore data from a dump.
4. **Verify after rollback:** `GET /ready` returns `200` (DB reachable) and `GET /health` shows the
   rolled-back `version`/`commit`; run `npm run db:migrate:check` against a copy of the schema to
   confirm `pgvector` + `ivfflat` + RLS are intact.

> Compatibility note: deploy a backward-compatible database state before (or together with) the API
> that depends on it, and roll back in the reverse order, so the running API and the schema never
> disagree.
