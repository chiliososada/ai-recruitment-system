# Performance

Performance methodology and a record sheet for the AI Recruitment System. **This is a
scaffold:** measured numbers are marked _to be recorded_ and must be filled in by the
referenced tooling — do not treat any cell as a measured result until it is.

Related: bundle gate `scripts/check-bundle.mjs`, metrics at `GET /metrics`, SLI/SLO
targets in [OPERATIONS.md](OPERATIONS.md).

---

## Methodology

- **Frontend bundle:** build (`npm run build`), then `node scripts/check-bundle.mjs`
  reports per-chunk gzip sizes and budgets the largest **entry** chunk against
  `INITIAL_JS_GZIP_BUDGET_KB` (default **200 KB** gzip). Lazy route/locale chunks are
  reported but not budgeted. Re-run after dependency or code-splitting changes.
- **Lighthouse:** run against the production SPA build served statically (e.g. the
  nginx image), median of ≥3 runs, on a defined throttling profile. Record category
  scores (Performance, Accessibility, Best Practices, SEO) and key web vitals.
- **API / DB latency:** measure p50/p95 per key endpoint under a defined concurrency
  with a load/bench script, reading server-side latency from `http_request_duration`
  (`/metrics`) and client-observed latency for cross-checking. Use the `supabase`
  runtime against a representative database for production-like numbers; note when a
  measurement is from the `local` (PGlite + mock) runtime, which is **not**
  representative of production AI/embedding latency.
- **Determinism:** record commit (`GIT_COMMIT`), runtime (`ARS_RUNTIME`), dataset/seed,
  hardware, and Node version with every result so numbers are comparable over time.

---

## Environment template (fill per measurement run)

| Field | Value |
| ----- | ----- |
| Date | 2026-06-19 |
| Commit (`GIT_COMMIT`) | `4a696da` (feat/ai-recruitment-mvp) |
| Runtime (`ARS_RUNTIME`) | `local` (PGlite + mock AI/embeddings) — **not** production-representative for AI latency |
| Hardware / instance | developer workstation (darwin/arm64) |
| Node version | 20 LTS (CI/Docker baseline) |
| Dataset / seed | 13 jobs, 8 candidates (parsed résumés + 384-dim embeddings), 1 company |
| Concurrency / tool | serial, in-process `app.inject` (handler + DB time, no network), 60 iters/scenario after 8 warmup (`npx tsx apps/api/scripts/benchmark.ts`) |

---

## Frontend bundle (from `scripts/check-bundle.mjs`)

Budget: initial JS **≤ 200 KB gzip** (`INITIAL_JS_GZIP_BUDGET_KB`, starting value;
tighten as code-splitting lands). Run `npm run build` then `node scripts/check-bundle.mjs`.

Measured at commit `4a696da` (build `npm run build -w @ars/web` → `node scripts/check-bundle.mjs`):

| Metric | Value | Budget | Status |
| ------ | ----- | ------ | ------ |
| Entry chunk (gzip) | 142.3 KB | 200 KB | ✅ PASS |
| Entry chunk (raw) | 459.9 KB | — | — |
| Number of JS chunks | 26 (per-route + per-locale code splitting) | — | — |
| CSS (gzip) | 3.8 KB | — | — |

The entry chunk is framework + design system + app shell; each feature page and the
`zh-CN`/`zh-TW` locale catalogs load as separate on-demand chunks (UI-6).

> Pre-upgrade baseline (from BASELINE.md, for context only — not a current measurement):
> single JS chunk ~410 KB raw / ~123 kB gzip, CSS ~3 kB, no code-splitting. Record the
> current build's real numbers above.

---

## Lighthouse targets

Run against the production SPA build (`vite preview`) via `node scripts/check-lighthouse.mjs`
(headless Chromium). a11y / best-practices / SEO are hard gates; performance is recorded as a
baseline. Measured at commit `4a696da` (median-equivalent single run, public routes):

| Category | Target (gate) | Measured |
| -------- | ------ | -------- |
| Accessibility | ≥ 95 | **100** ✅ |
| Best Practices | ≥ 90 | **96–100** ✅ |
| SEO | ≥ 85 | **91** ✅ |
| Performance | baseline (warn < 50) | **98–99** ✅ |

| Page | Perf | A11y | BP | SEO |
| ---- | ---- | ---- | -- | --- |
| Home (`/`) | 98 | 100 | 96 | 91 |
| Login (`/login`) | 99 | 100 | 100 | 91 |
| Register (`/register`) | 99 | 100 | 100 | 91 |

> Public routes are measured here because they render without API data. Authenticated-page
> a11y is independently gated at a stricter bar by the axe suite (`npm run test:a11y` — 0
> critical/serious on seeker + recruiter pages). Re-run on `supabase` for data-backed pages.

---

## API / DB latency (p50 / p95)

Measured on the **`local`** runtime (PGlite + mock providers) via `npx tsx
apps/api/scripts/benchmark.ts` at commit `4a696da`, 60 iterations/scenario after 8 warmup,
in-process `app.inject` (handler + DB time, no network hop). All scenarios returned HTTP 200.

| Endpoint | Method | p50 (ms) | p95 (ms) | Notes |
| -------- | ------ | -------- | -------- | ----- |
| `/health` | GET | 0.0 | 0.1 | Static liveness. |
| Jobs public list (`/api/jobs`) | GET | 1.9 | 3.0 | Partial index on public+open. |
| Companies list (`/api/companies`) | GET | 1.1 | 1.6 | Indexed by industry/size/name. |
| Job detail (`/api/jobs/:id`) | GET | 1.1 | 1.6 | PK lookup + skills. |
| Talent search (`/api/talent`) | GET | 6.9 | 7.4 | Filtered candidate search (uses `candidates_open_years_idx`). |
| Recommendations (`/api/candidates/me/recommendations`) | GET | 6.6 | 7.3 | Reads precomputed `match_results` (pgvector recall happens at upload time). |
| Notifications (`/api/notifications`) | GET | 0.7 | 1.1 | Partial unread index. |
| Login (`/api/auth/login`) | POST | 60.4 | 60.8 | Dominated by the password KDF (intentional, security cost) — not a DB/query cost. |

> **`supabase`-runtime numbers (network + managed Postgres + real AI) are not yet
> recorded** — they require cloud credentials. Re-run the same script with
> `ARS_RUNTIME=supabase` and the production env to capture them. Real LLM/embedding
> latency is exercised only at résumé-upload time (async via the queue), so it does not
> appear on these synchronous read paths.

### Async processing (queue) timings

| Stage | p50 | p95 | Notes |
| ----- | --- | --- | ----- |
| Parse job: queued → succeeded | _tbr_ | _tbr_ | Depends on provider latency (real vs mock). |
| LLM skill analysis | _tbr_ | _tbr_ | `supabase` runtime / real provider. |
| Embedding generation | _tbr_ | _tbr_ | 384-dim. |

---

## Notes

- Do not record `local`-runtime AI/embedding timings as production figures — mocks are
  deterministic and near-instant.
- Re-baseline after any dependency bump, code-splitting change, or scoring-algorithm
  version change; keep prior runs for trend comparison.
- Once baselines exist, promote the SLI/SLO targets in [OPERATIONS.md](OPERATIONS.md)
  from "suggested" to "agreed".
