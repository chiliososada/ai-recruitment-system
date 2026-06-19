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
| Date | _to be recorded_ |
| Commit (`GIT_COMMIT`) | _to be recorded_ |
| Runtime (`ARS_RUNTIME`) | _to be recorded_ (`local` is not production-representative) |
| Hardware / instance | _to be recorded_ |
| Node version | 20 LTS (CI/Docker baseline) |
| Dataset / seed | _to be recorded_ |
| Concurrency / tool | _to be recorded_ |

---

## Frontend bundle (from `scripts/check-bundle.mjs`)

Budget: initial JS **≤ 200 KB gzip** (`INITIAL_JS_GZIP_BUDGET_KB`, starting value;
tighten as code-splitting lands). Run `npm run build` then `node scripts/check-bundle.mjs`.

| Metric | Value | Budget | Status |
| ------ | ----- | ------ | ------ |
| Entry chunk (gzip) | _to be recorded_ | 200 KB | _to be recorded_ |
| Entry chunk (raw) | _to be recorded_ | — | — |
| Total JS (gzip) | _to be recorded_ | — | — |
| Number of JS chunks | _to be recorded_ | — | — |
| CSS (gzip) | _to be recorded_ | — | — |

> Pre-upgrade baseline (from BASELINE.md, for context only — not a current measurement):
> single JS chunk ~410 KB raw / ~123 kB gzip, CSS ~3 kB, no code-splitting. Record the
> current build's real numbers above.

---

## Lighthouse targets

Run against the production SPA build. Targets:

| Category | Target | Measured |
| -------- | ------ | -------- |
| Accessibility | ≥ 95 | _to be recorded_ |
| Best Practices | ≥ 95 | _to be recorded_ |
| SEO | ≥ 90 | _to be recorded_ |
| Performance | baseline (record first, then set a target) | _to be recorded_ |

Key web vitals (record alongside scores): LCP, CLS, TBT/INP — _to be recorded_.

| Page | Perf | A11y | BP | SEO |
| ---- | ---- | ---- | -- | --- |
| Home | _tbr_ | _tbr_ | _tbr_ | _tbr_ |
| Login / Register | _tbr_ | _tbr_ | _tbr_ | _tbr_ |
| Jobs browse | _tbr_ | _tbr_ | _tbr_ | _tbr_ |
| Seeker profile | _tbr_ | _tbr_ | _tbr_ | _tbr_ |
| Talent search | _tbr_ | _tbr_ | _tbr_ | _tbr_ |

---

## API / DB latency (p50 / p95)

Measured server-side from `http_request_duration` under the documented concurrency.
Mark the runtime — `supabase` for production-representative numbers. _All values below
to be recorded by the bench script._

| Endpoint | Method | p50 (ms) | p95 (ms) | Notes |
| -------- | ------ | -------- | -------- | ----- |
| `/health` | GET | _tbr_ | _tbr_ | Static liveness. |
| `/ready` | GET | _tbr_ | _tbr_ | Includes a DB round-trip. |
| Jobs public list | GET | _tbr_ | _tbr_ | Partial index on public+open. |
| Job detail | GET | _tbr_ | _tbr_ | |
| Talent search | GET | _tbr_ | _tbr_ | Filtered candidate search. |
| Recommendations / matches | GET | _tbr_ | _tbr_ | pgvector recall + scoring. |
| Messages by conversation | GET | _tbr_ | _tbr_ | |
| Résumé upload (enqueue) | POST | _tbr_ | _tbr_ | Returns fast; processing is async via the queue. |

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
