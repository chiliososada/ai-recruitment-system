# Verification — quality gate evidence

All gates were executed by the orchestrator `node scripts/verify.mjs` (runs every gate in
dependency order and stops at the first failure). The run below completed with **all 11
gates green (exit 0)**. Each gate can also be run standalone with the command shown.

Environment: macOS (darwin), Node v23.11.0, npm 10.9.2. Runtime under test: `local`
(in-process PGlite Postgres + pgvector, local JWT auth, filesystem storage, deterministic
mock AI/embeddings, mock virus scanner) — no external credentials required.

## Gate matrix (all PASS, exit 0)
| # | Gate | Command | Exit | Evidence |
|---|------|---------|------|----------|
| 1 | Install / lockfile | `npm ci` | 0 | clean install from committed `package-lock.json` |
| 2 | Format check | `npm run format:check` | 0 | "All matched files use Prettier code style!" |
| 3 | git diff --check | `git diff --check` | 0 | no whitespace/conflict errors |
| 4 | Lint | `npm run lint` | 0 | `eslint . --max-warnings=0` clean |
| 5 | Typecheck | `npm run typecheck` | 0 | `tsc --noEmit` clean across shared + api + web |
| 6 | Unit tests | `npm run test:unit` | 0 | **50 passed** (shared 28, api unit 9, web 13) |
| 7 | API integration tests | `npm run test:integration` | 0 | **58 passed** (auth, resume/parse, company/job, matching, talent, messaging, recruitment) |
| 8 | RLS / DB tests | `npm run test:rls` | 0 | **26 passed** (DB-layer RLS allow/deny 18 + security-negative 8) |
| 9 | Production build | `npm run build` | 0 | shared (tsc) + api (tsc) + web (tsc + vite build) all built |
| 10 | Migration validation | `npm run db:migrate:check` | 0 | 10 migrations + bootstrap + seed apply on a fresh DB; 25 public tables; pgvector + ivfflat + RLS verified |
| 11 | E2E (Playwright) | `npm run test:e2e` | 0 | **4 passed** — both required journeys end-to-end against the real running stack |

**Total: 138 automated tests pass** (50 unit + 58 integration + 26 RLS/DB + 4 E2E), plus the
build + migration + format + lint + typecheck + lockfile gates.

## Orchestrator summary (verbatim)
```
================ GATE SUMMARY ================
✅ PASS  Install / lockfile  (6.6s)  [npm ci]
✅ PASS  Format check  (1.0s)  [npm run format:check]
✅ PASS  git diff --check  (0.1s)  [git diff --check]
✅ PASS  Lint  (1.1s)  [npm run lint]
✅ PASS  Typecheck  (3.3s)  [npm run typecheck]
✅ PASS  Unit tests  (2.9s)  [npm run test:unit]
✅ PASS  API integration tests  (4.5s)  [npm run test:integration]
✅ PASS  RLS / DB tests  (2.2s)  [npm run test:rls]
✅ PASS  Production build  (4.0s)  [npm run build]
✅ PASS  Migration validation  (1.2s)  [npm run db:migrate:check]
✅ PASS  E2E (Playwright)  (7.1s)  [npm run test:e2e]
=============================================
```

## What each gate covers (test-area mapping, §9)
- **Unit** — validation (Zod), permission helpers, skill-analysis schema, scoring
  normalization/ordering/reproducibility, i18n key parity (4 locales), AI provider
  determinism + schema-retry fallback, RealtimeBus.
- **API integration** — register/login/verify, resume upload + parse status + retry,
  job CRUD, list filtering + pagination, AI matching, messaging, applications/interviews.
- **RLS / DB** — job-seeker / company-member / other-company / anonymous allow + deny at
  the DB layer (`SET LOCAL ROLE` + jwt claims), plus HTTP security-negative tests
  (IDOR/cross-tenant, unauthenticated, message authz, private-job leak).
- **E2E (Playwright)** — main path 1 (seeker: register → upload résumé → AI analysis +
  career advice → recommendations + companies → message → apply) and main path 2 (company:
  register → company → publish job → talent search → compare → ranked candidates → manage
  application stage → schedule interview), driving the real API + SPA.
- **File-boundary** (within integration) — wrong type (415), > 10 MB (413), empty (400),
  EICAR/infected (422), malicious filename sanitization.

## Applicability notes (§9 — nothing silently skipped)
- The **`supabase` runtime** is not exercised by automated tests because it requires
  external credentials (Supabase project + AI/scanner API keys). It is implemented behind
  the same adapter interfaces as the verified `local` runtime, runs the identical SQL
  migrations, and is documented in `README.md` / `docs/DEPLOY.md`. This is the only path
  not covered by automated gates, by design (§2.4), and the `local` runtime exercises the
  full vertical of every feature.
- Playwright requires a one-time `npx playwright install chromium` (browser binary), then
  the E2E gate boots the API (`tsx`) + web (`vite`) servers itself.

## How to reproduce
```bash
npm install
npx playwright install chromium   # once
node scripts/verify.mjs           # runs all 11 gates
```
