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

## 1. Supabase setup

1. **Create a project** (or use a self-hosted Supabase / Postgres). Note the project URL, anon key,
   service-role key, JWT secret, and the database connection string.
2. **Enable the `vector` extension.** Migration `0001` runs `create extension if not exists vector`;
   ensure your project allows it (Supabase: Database → Extensions → enable `vector`).
3. **Apply migrations in numeric order** — `supabase/migrations/0001…0010`. Do **not** apply
   `supabase/local/bootstrap.sql` (it is local-only; Supabase already provides `auth`/`storage` and
   the roles). For example:

   ```bash
   supabase db push
   # or apply each file in order with psql:
   # for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```

4. **Storage bucket:** migration `0010` creates the private `resumes` bucket and its RLS policies.
   Confirm the bucket exists and matches `SUPABASE_STORAGE_BUCKET`.
5. *(Optional)* apply `supabase/seed.sql` for the reference skill dictionary.

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

It binds to `API_HOST:API_PORT` and logs `API listening on … (runtime=supabase)`.

- **Healthcheck:** `GET /health` → `{ "status": "ok", "runtime": "supabase" }`. Point your load
  balancer / orchestrator liveness probe at it.
- **OpenAPI:** `GET /openapi.json`.
- **CORS:** set `WEB_ORIGIN` to the SPA's deployed origin(s), comma-separated.
- **Uploads:** capped by `MAX_UPLOAD_BYTES` (default 10 MB).

### Boot-time guards

The API refuses to start with insecure production configuration:

- `VIRUS_SCANNER=mock` is rejected when `NODE_ENV=production` + `ARS_RUNTIME=supabase` — configure a
  real scanner (ClamAV).
- the default `LOCAL_JWT_SECRET` is rejected in production.
- `ARS_RUNTIME=supabase` requires `DATABASE_URL`.

### Virus scanning (ClamAV)

Set `VIRUS_SCANNER=clamav` and point `CLAMAV_HOST` / `CLAMAV_PORT` (default `127.0.0.1:3310`) at a
reachable `clamd` instance. The adapter streams uploads over the INSTREAM protocol.

---

## 3. SPA (static)

`apps/web/dist` is a static build — serve it from any static host or CDN (Netlify, Vercel static,
S3 + CloudFront, Nginx, etc.) with SPA fallback routing (serve `index.html` for unknown routes).

The API base URL is baked in at **build time** via `VITE_API_BASE_URL`, so set it before
`npm run build` (it cannot be changed without rebuilding):

```bash
VITE_API_BASE_URL=https://api.example.com VITE_DEFAULT_LOCALE=ja npm run build
```

---

## Required environment variables (production)

Set on the **API** host (unless noted as build-time for the SPA):

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NODE_ENV` | yes | `production` |
| `ARS_RUNTIME` | yes | `supabase` |
| `API_PORT` / `API_HOST` | recommended | API bind address |
| `WEB_ORIGIN` | yes | SPA origin(s), comma-separated (CORS) |
| `LOCAL_JWT_SECRET` | yes | Strong secret signing app-issued JWTs (default is rejected in prod) |
| `MAX_UPLOAD_BYTES` | optional | Default 10 MB |
| `DATABASE_URL` | yes | Postgres connection string |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key (server-side authorized writes) |
| `SUPABASE_JWT_SECRET` | yes | Verifies Supabase Auth tokens |
| `SUPABASE_STORAGE_BUCKET` | optional | Default `resumes` |
| `AI_PROVIDER` | yes | `anthropic` (or `openai`) — not `mock` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | if `anthropic` | API key / model |
| `EMBEDDING_PROVIDER` | yes | `openai` |
| `EMBEDDING_DIMENSIONS` | optional | Default `384` (must match the `vector(384)` columns) |
| `OPENAI_API_KEY` / `OPENAI_EMBEDDING_MODEL` | if `openai` | API key / model |
| `VIRUS_SCANNER` | yes | `clamav` (mock is rejected in prod) |
| `CLAMAV_HOST` / `CLAMAV_PORT` | if `clamav` | clamd address |
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
4. **Verify after rollback:** `GET /health` returns ok, and run `npm run db:migrate:check` against a
   copy of the schema to confirm `pgvector` + `ivfflat` + RLS are intact.

> Compatibility note: deploy a backward-compatible database state before (or together with) the API
> that depends on it, and roll back in the reverse order, so the running API and the schema never
> disagree.
