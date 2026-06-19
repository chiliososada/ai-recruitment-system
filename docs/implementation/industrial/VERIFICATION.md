# Industrial Upgrade — Verification

Records exact commands, exit codes, test counts, screenshot paths, performance, a11y and security
evidence for the industrial upgrade.

> Status: **COMPLETE**. All applicable gates exit 0. The protected pre-upgrade baseline (138
> tests) still passes as a subset; no FR-01–FR-10 behavior, permission boundary, API contract,
> data meaning, locale, or main journey was removed, weakened, hidden, mocked, or broken.

Final verification round at commit `4bbf971` (branch `feat/ai-recruitment-mvp`; 10 commits on top
of the protected baseline `73b3e22`). Runtime: `local` (PGlite + pgvector, local JWT, fs storage,
deterministic mock AI/scanner — no cloud credentials required), Node 20, darwin/arm64.

## Baseline gate run (pre-upgrade, commit `73b3e22`) — all exit 0

Command: `node scripts/verify.mjs` → **138 automated tests** (Unit 50, API integration 58, RLS 26,
E2E 4) + install/format/diff/lint/typecheck/build/migrate. This is the protected baseline
(see `FEATURE_PARITY.md`); every one of these still passes below.

## Final extended gate matrix — all exit 0

| Gate | Command | Exit | Evidence |
|------|---------|------|----------|
| Format check | `npm run format:check` | 0 | "All matched files use Prettier code style!" |
| Lint | `npm run lint` | 0 | `eslint . --max-warnings=0`, clean |
| Typecheck (3 workspaces) | `npm run typecheck` | 0 | 0 `error TS` |
| Unit / component | `npm run test` | 0 | @ars/shared **35**, @ars/api **121**, @ars/web **25** |
| API integration | `npm run test:integration` | 0 | **78** (incl. OpenAPI contract, rate-limit 429, idempotency/concurrency, health/ready, security-files, job queue) |
| RLS / DB | `npm run test:rls` | 0 | **26** |
| Migration validation | `npm run db:migrate:check` | 0 | "OK — 12 migrations, 26 public tables, pgvector + ivfflat + RLS verified" |
| Production build | `npm run build` | 0 | shared + api + web built |
| E2E journeys (Playwright) | `npm run test:e2e` | 0 | **4 passed** (seeker + recruiter journeys) |
| Accessibility (axe, WCAG 2.1 AA) | `npm run test:a11y` | 0 | **3 passed** — 0 critical/serious on public/status/seeker/recruiter pages + keyboard operability |
| Visual + browser-quality | `npm run test:visual` | 0 | **1 passed**, **110 screenshots**, no horizontal overflow, no console/page/request errors |
| Dependency / secret scan | `npm run scan:security` | 0 | "Security scan passed" (npm audit + secret patterns; `audit-allowlist.json`) |
| Bundle budget | `npm run check:bundle` | 0 | entry **142.3 KB gzip ≤ 200 KB** |
| SBOM | `npm run sbom` | 0 | CycloneDX 1.5, **643 components** → `sbom.cyclonedx.json` (gitignored) |
| Lighthouse | `npm run lighthouse` (served prod build) | 0 | Perf 98–99, **A11y 100**, Best-Practices 96–100, SEO 91 (gates: a11y≥95/BP≥90/SEO≥85) |
| API/DB benchmark | `npm run bench` | 0 | 8 scenarios, p50/p95 → `docs/PERFORMANCE.md` |
| Docker | `infra/docker/{Dockerfile.api,Dockerfile.web,docker-compose.yml}` | documented | Multi-stage non-root images + nginx + compose; build requires a Docker daemon (unavailable in this sandbox) — usage in README/DEPLOY |

**Totals:** 181 vitest tests (shared 35 + api 121 + web 25) + 8 Playwright tests (4 E2E + 3 a11y +
1 visual driving 110 screenshots). The 138-test baseline is a strict subset and remains green.

## Accessibility (A11Y-1 / A11Y-2)

`npm run test:a11y` — `@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa`.
**0 critical/serious violations** on: `/`, `/login`, `/register`, `/jobs`, `/companies`, `/403`,
unknown-route (404); authenticated seeker `/me`, `/recommendations`, `/applications`; recruiter
`/console`, `/talent`, `/shortlist`. Keyboard test: login form reachable + submittable by Tab with
visible focus. Two real violations were found and fixed: `nested-interactive` (ResumeDropzone — the
button is now the focusable control, the div is a drop region) and `link-in-text-block` (in-text
links underlined, WCAG 1.4.1). Lighthouse a11y = 100 corroborates.

## Screenshots (VIS-1 / UI-4)

`npm run test:visual` writes to **`apps/web/visual-baseline/`** (gitignored): 5 viewports
(320, 390, 768, 1024, 1440) × 2 locales (ja, en) × 11 pages = **110 PNGs**. Each asserts
`scrollWidth - clientWidth ≤ 2` (no horizontal overflow) and zero console/page/request errors.
Reviewed samples: `desktop-en-recommendations.png` (role-aware sidebar + match card),
`mobile-ja-home.png` (wrapped public topbar), `xs-en-talent.png` (320px recruiter search),
`mobile-en-talent.png` (hamburger nav). i18n parity across ja/en/zh-CN/zh-TW enforced by
`i18n.parity.test.ts`.

## Performance

- Frontend: entry chunk **142.3 KB gzip** (< 200 KB budget); 26 JS chunks (per-route + per-locale
  code splitting, UI-6). Lighthouse Perf 98–99 on `/`, `/login`, `/register`.
- API/DB (`local`, in-process inject, 60 iters): jobs list p50 1.9 / p95 3.0 ms; job detail ~1 ms;
  talent search p50 6.9 / p95 7.4 ms; recommendations p50 6.6 / p95 7.3 ms; login p50 ~60 ms
  (password KDF cost). Full table + methodology in `docs/PERFORMANCE.md`. `supabase`-runtime
  numbers require cloud credentials and are documented as pending.

## Security & reliability

- Headers: helmet with strict CSP (`default-src 'none'`, `frame-ancestors 'none'`, `base-uri
  'none'`, `form-action 'none'`), CORP cross-origin, no-referrer, HSTS in prod.
- Rate limiting: configurable global (`RATE_LIMIT_MAX`, default 300/min) + per-route limits on
  résumé upload (10), message send (60), apply/interview (30); 429 returns localized
  `error.rateLimited`. Integration-tested.
- Logging: pino redaction of password/token/accessToken/resumeText/prompt/apiKey + `redactForLog`
  PII scrubbing (emails, phone numbers, long tokens). Unit-tested.
- Resilience: circuit breaker + timeout + bounded retry around AI/embedding providers; durable
  Postgres job queue (lease/attempts/backoff/timeout/dead-letter/idempotency); graceful shutdown.
- Health/readiness/observability: `/health` (version/commit/uptime), `/ready` (DB check → 503),
  `/metrics` (Prometheus exposition), `/openapi.json`.
- RLS: per-request `SET LOCAL ROLE` + `request.jwt.claims`; 26 RLS tests green.
- SBOM: `node scripts/gen-sbom.mjs` → CycloneDX (643 components). Dependency policy in
  `docs/SECURITY.md`.

## Repository hygiene

- `git status` — **clean** (working tree matches HEAD; gate artifacts `visual-baseline/`,
  `sbom.cyclonedx.json`, `dist/`, `.storage-test/` are gitignored).
- Secret scan over tracked non-doc files (private keys / AWS / `sk-ant-…`): **none found**.
- No `git reset --hard`, `git clean -fd`, force-push, or destructive DB ops were used. All
  migrations are additive/forward-only (`0012_indexes.sql` adds an index — `create index if not
  exists`, no table/FK changes). No production deploy, push, merge, or paid cloud resource created.
- No production secrets committed; the `local` runtime needs no credentials.

## Feature parity

All FR-01–FR-10 behaviors, permission boundaries, API contracts (backward-compatible; OpenAPI
contract-tested), data meanings, the four locales, and the main seeker/recruiter journeys are
preserved — see `FEATURE_PARITY.md`. The upgrade is additive: design-system, app shell, error
pages, durable queue, resilience, rate-limit hardening, observability, indexes, code-splitting,
docs, and the a11y/visual/perf/security gates were added without changing existing semantics.
