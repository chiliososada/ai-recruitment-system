# AI Recruitment System

An AI-assisted talent recruitment & matching platform (MVP). Job seekers upload résumés, receive
AI skill analysis and career advice, browse companies/jobs, apply, and message recruiters.
Companies create jobs, search and compare talent, view ranked AI matches, manage the hiring
pipeline, and schedule interviews.

The whole stack — including a real Postgres with `pgvector`, RLS, AI analysis, embeddings, and
virus scanning — **runs locally with zero external credentials** thanks to deterministic mocks and
an in-process database. The same code runs against real Supabase + Anthropic/OpenAI by flipping
environment variables.

---

## Architecture

TypeScript monorepo using **npm workspaces**.

```
ai-recruitment-system/
├── apps/
│   ├── web/                 @ars/web  — React + Vite SPA (TypeScript)
│   └── api/                 @ars/api  — Fastify API + swappable adapters
├── packages/
│   └── shared/              @ars/shared — Zod DTOs/schemas, enums, scoring algorithm
├── supabase/
│   ├── migrations/          Numbered, forward-only SQL (schema, indexes, RLS, storage)
│   ├── local/bootstrap.sql  LOCAL-ONLY auth/storage shim + roles (applied before migrations)
│   └── seed.sql             Non-sensitive reference seed (skill dictionary)
├── docs/                    Operational & technical docs (see "Further documentation")
├── infra/docker/            Production Dockerfiles + nginx + docker-compose
└── scripts/                 verify.mjs (gate runner), scan-security.mjs, check-bundle.mjs, gen-sbom.mjs
```

- **`@ars/shared`** is the single source of truth for request/response DTOs, enums, the error
  envelope, pagination, prompt-safety helpers, and the versioned scoring algorithm. Both apps
  depend on it, which prevents client/server type drift.
- **`@ars/api`** is a Fastify 5 server. Every external concern is behind a **swappable adapter**
  whose production implementation and deterministic test mock share one interface: auth, JWT token
  service, object storage, virus scanning, LLM, and embeddings.
- **`@ars/web`** is a React 18 + React Router SPA built with Vite, using TanStack Query for data
  fetching and `react-i18next` for localization.

### Two runtimes (`ARS_RUNTIME`)

The API selects its concrete adapters at boot from one switch:

| `ARS_RUNTIME` | Database | Auth | Storage | LLM / Embeddings | Virus scan | Credentials |
| ------------- | -------- | ---- | ------- | ---------------- | ---------- | ----------- |
| `local` (default) | In-process PGlite Postgres (+ `pgvector`) | Local bcrypt + credential table | Filesystem | Deterministic mock | Mock (flags EICAR) | **None** |
| `supabase` | Supabase Postgres via `pg` pool | Supabase Auth (GoTrue) | Supabase Storage | Anthropic / OpenAI | clamd (ClamAV) | Required |

The **same SQL migrations** run on both. On local PGlite, `supabase/local/bootstrap.sql` first
recreates the pieces a real Supabase project provides natively (the `auth`/`storage` schemas, helper
functions, and the `authenticated`/`anon`/`service_role` roles), then the canonical migrations
apply. On real Supabase only `supabase/migrations/*` apply.

### Defense-in-depth authorization (RLS everywhere)

Authorization is enforced at the database, not just in app code. On every request the API opens a
transaction, runs `SET LOCAL ROLE authenticated|anon` plus `SET LOCAL request.jwt.claims` to the
caller's JWT payload, and then runs queries. The **same** Postgres Row Level Security policies
(`supabase/migrations/0009_rls.sql`) that protect a real Supabase project also block IDOR and
cross-tenant access locally — and are covered by negative tests. See [docs/DATABASE.md](docs/DATABASE.md).

---

## Prerequisites

- **Node.js >= 20** and **npm** (npm workspaces; the install gate is `npm ci`).
- For the **E2E** suite: a Chromium download — `npx playwright install chromium` (once).
- **Optional**, only for the `supabase` runtime: **Docker** and the **Supabase CLI**.

No database server, API keys, or cloud account is needed for local development or the full test
suite.

---

## Install

```bash
npm install
```

This installs all workspaces. To build the shared package on its own (dependents need its `dist`):

```bash
npm run build:shared
```

---

## Environment variables

Copy the example and edit as needed:

```bash
cp .env.example .env
```

**With the defaults (`ARS_RUNTIME=local`) no variables need to be set** — the stack and tests run on
in-process Postgres with deterministic mocks. The most relevant variables (full list and defaults in
[`.env.example`](.env.example)):

| Variable | Purpose | Local default |
| -------- | ------- | ------------- |
| `ARS_RUNTIME` | `local` or `supabase` | `local` |
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `API_PORT` / `API_HOST` | API bind address | `4000` / `127.0.0.1` |
| `WEB_ORIGIN` | Comma-separated allowed CORS origins | `http://localhost:5173` |
| `LOCAL_JWT_SECRET` | Signs local-mode JWTs (must be overridden in any shared env) | dev placeholder |
| `MAX_UPLOAD_BYTES` | Upload size limit | `10485760` (10 MB) |
| `AI_PROVIDER` | `mock` / `anthropic` / `openai` | `mock` |
| `EMBEDDING_PROVIDER` | `mock` / `openai` (384-dim) | `mock` |
| `VIRUS_SCANNER` | `mock` / `clamav` | `mock` |
| `DATABASE_URL` | Postgres connection (required when `ARS_RUNTIME=supabase`) | — |
| `SUPABASE_URL` / `SUPABASE_*_KEY` / `SUPABASE_JWT_SECRET` | Supabase credentials (supabase runtime) | — |
| `VITE_API_BASE_URL` | API base URL the SPA calls | `http://localhost:4000` |
| `VITE_DEFAULT_LOCALE` | Initial UI locale | `ja` |

The API refuses to boot in production with insecure defaults: `VIRUS_SCANNER=mock` is rejected
when `NODE_ENV=production` + `ARS_RUNTIME=supabase`, the default `LOCAL_JWT_SECRET` is rejected in
production, and `ARS_RUNTIME=supabase` requires `DATABASE_URL`.

---

## Running in development

Run the API and the SPA in two terminals (both from the repo root):

```bash
# Terminal 1 — API on http://127.0.0.1:4000 (local PGlite + mocks)
npm run dev -w @ars/api

# Terminal 2 — SPA on http://localhost:5173
npm run dev -w @ars/web
```

Optionally load demo data so you can walk both journeys immediately:

```bash
npm run seed -w @ars/api
```

This programmatically creates a demo seeker (with a parsed résumé, AI analysis, and embedding) and a
demo company with a public "Full-Stack Engineer" job:

| Role | Email | Password |
| ---- | ----- | -------- |
| Job seeker | `seeker@example.com` | `passw0rd1` |
| Company recruiter | `recruiter@example.com` | `passw0rd1` |

> The local in-process PGlite database is **ephemeral** — it is rebuilt on each API start. Re-run the
> seed after restarting if you want the demo data back.

API endpoints live under `/api`. Useful unauthenticated operational endpoints (served at
the root, not under `/api`):

- `GET /health` — liveness (`{ "status": "ok", "runtime", "version", "commit", "uptime" }`).
  Always `200` while the process is up; does **not** touch the DB.
- `GET /ready` — readiness; runs a real `select 1` against the database. `200` when
  dependencies pass, `503` otherwise. Use this (not `/health`) to gate traffic.
- `GET /metrics` — Prometheus-style exposition (`text/plain; version=0.0.4`): request
  rate/latency, provider metrics, and job-queue depth gauges. Never fails the scrape.
- `GET /openapi.json` — the generated OpenAPI document.

Every response echoes an `x-correlation-id` header for log correlation.

---

## Try it — the two demo journeys

These mirror the Playwright E2E tests in `apps/web/e2e/journeys.spec.ts`.

**1. Company journey**

1. Register as **Company recruiter** → land on the console (`/console`).
2. Create a company, open it, and create a job with required skills (e.g. TypeScript, React,
   Node.js); set status **open** and visibility **public** to publish it.
3. Go to **Talent** (`/talent`): search candidates, select two and **Compare** them side by side.
4. Open the published job to see **ranked candidates** with scores and short reasons.
5. Advance an application's stage (e.g. applied → screening) and **propose an interview**.

**2. Job-seeker journey**

1. Register as **Job seeker** → land on your profile (`/me`).
2. Upload a résumé (PDF or DOCX). The parse status moves to **Ready**, then the **AI skill
   analysis** (skills + career directions) appears.
3. Open **Recommendations** (`/recommendations`) to see matched jobs.
4. Browse **Companies**, open a company, and send it a message.
5. Open a recommended job and **Apply**; confirm/decline any interview the company proposes.

---

## Tests & quality gates

All gates are root `package.json` scripts; run any individually from the repo root:

```bash
npm ci                        # install / lockfile consistency
npm run format:check          # Prettier (prettier --check .)
git diff --check              # no whitespace errors / conflict markers
npm run lint                  # ESLint (--max-warnings=0)
npm run typecheck             # tsc across all workspaces
npm run test:unit             # unit: validation, authz, scoring, schema, i18n
npm run test:integration      # API integration tests (@ars/api, real app in-process)
npm run test:rls              # RLS / DB negative tests (cross-role, cross-tenant, IDOR)
npm run build                 # production build of all workspaces (shared → api → web)
npm run db:migrate:check      # applies bootstrap + migrations + seed; verifies pgvector/ivfflat/RLS
npm run test:e2e              # Playwright E2E (boots real API + built SPA)
npm run test:a11y             # accessibility checks (@ars/web)
npm run test:visual           # visual-regression checks (@ars/web)
npm run scan:security         # supply-chain + secret scan (node scripts/scan-security.mjs)
npm run check:bundle          # SPA bundle-size budget (node scripts/check-bundle.mjs)
```

E2E / a11y / visual require Chromium once: `npx playwright install chromium`.

**One-shot orchestrator** — runs the core gates in dependency order with a pass/fail
summary, stopping at the first failure and exiting non-zero:

```bash
node scripts/verify.mjs            # core gates
node scripts/verify.mjs --skip-e2e # skip Playwright
```

`scripts/verify.mjs` covers install → format → `git diff --check` → lint → typecheck →
unit → integration → RLS → build → migrate-check → E2E. The browser-specific suites
(`test:a11y`, `test:visual`), the bundle budget (`check:bundle`), and the security scan
(`scan:security`) are **not** part of `verify.mjs` — run those explicitly (CI runs the
security scan as a discrete step; see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

> Supply-chain extras: `node scripts/gen-sbom.mjs` writes a CycloneDX SBOM to
> `sbom.cyclonedx.json` (see [docs/SECURITY.md](docs/SECURITY.md)).

---

## Production build

```bash
npm run build
```

This builds `@ars/shared`, then `@ars/api` (to `apps/api/dist`), then `@ars/web` (to
`apps/web/dist`). Start the compiled API with:

```bash
node apps/api/dist/server.js
```

Serve `apps/web/dist` as static files behind any static host/CDN, configured with
`VITE_API_BASE_URL` pointing at the API.

---

## Durable job queue

Résumé parsing and AI analysis run **asynchronously** through a Postgres-backed durable
queue (`job_queue` table, migration `0011`). It claims work with
`FOR UPDATE SKIP LOCKED` and supports attempts, exponential backoff, lease/timeout,
dead-lettering, and idempotency keys — so jobs survive restarts and multiple API/worker
instances never double-process. Queue depth is exposed at `GET /metrics`
(`job_queue_depth{status=...}`).

The `JOBS_INLINE` switch picks the drain mode:

- `local`/`test` (default): **inline** — jobs drain in-process for deterministic dev/CI.
- `supabase`/prod (default `JOBS_INLINE=false`): a **background worker** drains the queue;
  run N API instances and/or dedicated workers safely. See
  [docs/OPERATIONS.md](docs/OPERATIONS.md) for scaling.

---

## Docker & docker-compose

Production images and a local "supabase-style" stack live in `infra/docker/`. **The
default `local` runtime needs no containers at all** — these are for the `supabase`
runtime / image smoke-tests. Build contexts are the **repository root**.

Build the images (from the repo root):

```bash
docker build -f infra/docker/Dockerfile.api -t ars-api .
docker build -f infra/docker/Dockerfile.web \
  --build-arg VITE_API_BASE_URL=https://api.example.com -t ars-web .
```

- **`Dockerfile.api`** — multi-stage, `node:20-slim`, non-root, production deps + compiled
  `dist` + `supabase/` migrations. `HEALTHCHECK` curls `/ready`; runs `node` as PID 1 for
  graceful SIGTERM drain.
- **`Dockerfile.web`** — multi-stage; builds the SPA (with `VITE_API_BASE_URL` baked in at
  build time) and serves it via `nginx:1.27-alpine` on port `8080` with SPA history
  fallback and the security headers from `infra/docker/nginx.conf`.

`docker compose` (DB-only by default; `api`/`web` gated behind the `apps` profile):

```bash
# Real Postgres + pgvector only (pgvector/pgvector:pg16) — useful to exercise ARS_RUNTIME=supabase:
docker compose -f infra/docker/docker-compose.yml up postgres

# Build + run api + web + db together (copy .env.example → infra/docker/.env first and set
# ARS_RUNTIME=supabase, DATABASE_URL, secrets, provider keys):
docker compose -f infra/docker/docker-compose.yml --profile apps up --build
```

Production deployment specifics (env vars, migrations, health/readiness, rollback) are in
[docs/DEPLOY.md](docs/DEPLOY.md).

---

## Deployment

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for deploying the SPA (static), the Node API, and Supabase
(project setup, extensions, migration order, storage bucket), plus the required env-var table and
rollback procedure.

## Further documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — system architecture, components, adapters, and the two-runtime design.
- **[docs/API.md](docs/API.md)** — REST conventions, error envelope, pagination, and the endpoint catalog.
- **[docs/AI.md](docs/AI.md)** — provider interfaces, structured analysis schema, embeddings, scoring formula, and prompt-injection / privacy defenses.
- **[docs/DATABASE.md](docs/DATABASE.md)** — tables, relationships, RLS model, storage policies, and rollback/restore.
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — ordered production deploy procedure for the `supabase` runtime, env vars, migrations, container run, health checks, and rollback.
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — env matrix, migrations, health/readiness/metrics, scaling, data retention & account deletion, backup/restore, SLI/SLO.
- **[docs/SECURITY.md](docs/SECURITY.md)** — threat model, trust boundaries, controls, SBOM & dependency policy, and the production security checklist.
- **[docs/PERFORMANCE.md](docs/PERFORMANCE.md)** — performance targets, benchmarks, and tuning.
- **[docs/RUNBOOK.md](docs/RUNBOOK.md)** — incident procedures and recovery steps.

## License

MIT.
