# Industrial Upgrade — Baseline

Snapshot of the system **before** the industrial upgrade, captured from the completed MVP
(commit `73b3e22`, branch `feat/ai-recruitment-mvp`). This is the functional + interface +
test + performance baseline that the upgrade must preserve.

## Architecture (as-is)
- npm-workspace monorepo: `packages/shared` (`@ars/shared` — Zod DTO/schema, enums, scoring),
  `apps/api` (`@ars/api` — Fastify 5 + swappable adapters), `apps/web` (`@ars/web` — React 18 +
  Vite SPA, react-query, react-i18next).
- Two runtimes via `ARS_RUNTIME`: `local` (in-process PGlite Postgres + pgvector, local JWT,
  filesystem storage, deterministic mock AI/embeddings, mock virus scanner — no creds) and
  `supabase` (real Postgres via `pg`, Supabase Auth/Storage, Anthropic/OpenAI, clamd).
- RLS enforced per request (`SET LOCAL ROLE` + `request.jwt.claims`); 10 numbered migrations.

## Pages (as-is) — functional but minimal styling
Home, Login, Register, VerifyEmail, AccountSettings, JobsBrowse, JobDetail, CompaniesBrowse,
CompanyDetail, SeekerProfile (résumé + AI analysis + radar), Recommendations, MyApplications,
Messages, Notifications, CompanyConsole, CompanyManage, JobManage, TalentSearch, CandidateDetail,
Shortlist. Styling: a single hand-written `apps/web/src/styles.css` with a few CSS variables; no
component library, no AppShell/Sidebar, no 404/403/500 pages, no error boundaries.

## API surface (as-is)
`/health`, `/openapi.json`, and `/api/*` route groups: auth, candidates/resume/analysis,
companies, jobs, matching, talent, messaging/notifications, applications/shortlist/compare/
interviews. Unified `ApiError` envelope, pagination envelope, correlation id, global rate limit.

## Tests + gates (baseline — all green at `73b3e22`)
- Unit 50 (shared 28 + api providers.unit 9 + web 13), API integration 58, RLS/DB 26, E2E 4.
- **138 automated tests pass.** Gates green (exit 0): `npm ci`, `format:check`, `git diff --check`,
  `lint`, `typecheck`, `test:unit`, `test:integration`, `test:rls`, `build`, `db:migrate:check`,
  `test:e2e` — see `docs/implementation/VERIFICATION.md`.
- Web production build: single JS chunk ~410 kB (123 kB gzip), CSS ~3 kB. No code-splitting.

## Known gaps for industrialization (drive the upgrade)
| Area | Gap |
|------|-----|
| Design | No token system/scales, no reusable accessible component library, no AppShell, style drift risk, no 404/403/500, no error boundaries, emoji-free but no icon set. |
| a11y | No automated axe scans; focus/keyboard not audited; charts have text equiv but unverified. |
| Frontend perf | No code-splitting, no locale lazy-load, no bundle budget, no Lighthouse CI. |
| Async jobs | Résumé parse/analysis runs **inline/synchronously** in the request — no durable queue, lease, backoff, dead-letter, or worker shutdown. |
| Provider resilience | LLM/embedding adapters have basic retry in analysis only; no timeouts/circuit breaker/metrics. |
| Health | `/health` only; no `/ready` (dependency checks), no version/commit, no graceful shutdown. |
| Security | helmet CSP disabled; file validation is MIME+extension (no magic bytes / zip-bomb guard); no `docs/SECURITY.md`, no dependency/secret scan gate. |
| Observability | Structured logs + redaction exist; no metrics/tracing adapter, no SLI/SLO, no runbook. |
| CI/CD / deploy | No CI pipeline, no Dockerfile, no SBOM, no `docs/OPERATIONS.md`/`RUNBOOK.md`. |
| Testing | No component-library tests, no a11y gate, no visual-regression, no contract tests, no perf scripts. |

## Constraints honored
Functional freeze on FR-01–FR-10 (see `FEATURE_PARITY.md`); additive DB migrations only; no
destructive git ops; no real deploy/push without authorization; local determinism preserved.
