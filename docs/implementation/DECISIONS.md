# Architecture & spec-gap decisions

Each decision: context → choice → rationale → consequence.

## D-001 — Monorepo with npm workspaces
Repo was empty; no pnpm/yarn present. **Choice:** npm workspaces (`packages/*`, `apps/*`).
**Why:** npm 10 ships with Node 23 here; zero extra tooling; lockfile gate = `npm ci`.
**Consequence:** Cross-package imports use the `@ars/*` names; shared builds before dependents.

## D-002 — Backend = Fastify + TypeScript
Empty repo, free choice. **Choice:** Fastify 5. **Why:** lightweight, actively maintained,
first-class TS, JSON-schema/Zod friendly, built-in hooks for correlation ID, rate limit, error
mapping; easy in-process boot for integration tests. **Consequence:** Routes are plain modules
booted by a `buildServer()` factory so tests run the real app in-process.

## D-003 — Validation/DTO = Zod in `@ars/shared`
**Choice:** Zod schemas live in the shared package and are the single source of truth for API
input validation, AI-output validation, and (via inference) DTO types consumed by the SPA.
**Why:** avoids client/server type drift (NFR-API); enables prompt-output schema validation
(FR-02.6, FR-03.2). **Consequence:** Both apps depend on `@ars/shared`.

## D-004 — Local Postgres for dev/test = PGlite (in-process WASM), with `pg` for prod/Supabase
The task forbids letting missing Supabase credentials block local verification, and demands
real RLS + pgvector tests. **Choice:** `@electric-sql/pglite` + its `vector` extension provides a
real Postgres (incl. pgvector + RLS + roles) in-process with no Docker/credentials, used as the
default DB for dev and the entire test suite. The same SQL migrations run against a real Supabase
/ Postgres instance via `pg` when `ARS_RUNTIME=supabase`. **Why:** deterministic, fast, hermetic,
yet exercises genuine RLS/pgvector behavior — not a fake. **Consequence:** one thin `Db` interface
(`query`/`tx`) with two implementations; migrations must be portable SQL.

## D-005 — RLS enforced at the API DB layer via per-request role + JWT claims
Supabase enforces RLS because PostgREST runs queries as `authenticated`/`anon` with
`request.jwt.claims` set. Our custom Node API reproduces this: every request opens a transaction,
`SET LOCAL ROLE` to `authenticated`/`anon`, `SET LOCAL request.jwt.claims` to the user's JWT
payload, then runs queries — so the **same** RLS policies block IDOR/cross-tenant access at the DB,
not just in app code. **Why:** satisfies "backend AND RLS must block" (§4) and makes RLS testable
locally. **Consequence:** migrations `GRANT` table privileges to `authenticated`/`anon`; policies
use `auth.uid()` / `auth.role()`.

## D-006 — `auth`/`storage` schema shims are LOCAL-ONLY bootstrap, not canonical migrations
Supabase already provides the `auth` schema (`auth.uid()`, `auth.role()`, `auth.jwt()`) and the
`storage` schema. To keep `supabase/migrations/*` clean for a real Supabase project, the shim that
recreates those functions + the `authenticated`/`anon` roles lives in
`supabase/local/bootstrap.sql`, applied by the test/dev harness **before** the canonical migrations.
**Consequence:** Real Supabase deploy applies only `supabase/migrations/*`; local PGlite applies
bootstrap + migrations.

## D-007 — AI + embedding providers behind one interface; deterministic mock default
**Choice:** `LlmProvider` and `EmbeddingProvider` interfaces with a `mock` implementation
(deterministic, derived from input text via stable hashing) and real `anthropic`/`openai`
implementations sharing the interface. Mock is the default (`AI_PROVIDER=mock`).
**Why:** FR-03/FR-05 + NFR-AI require swappable providers and reproducible tests with no API keys.
**Consequence:** Scoring is reproducible; tests assert determinism; real providers documented in
`docs/AI.md` and gated behind env keys.

## D-008 — Matching = vector recall → deterministic rule score (0–100) → optional LLM rerank/explain
**Choice:** candidate/job embeddings via pgvector cosine recall, then a versioned, pure scoring
function combining vector similarity + skill overlap + experience fit + salary/location/language
rules, normalized to 0–100. LLM only re-orders top-K and writes short reasons within constrained
bounds; it is never the sole scorer. **Why:** FR-05.2/05.3 (explainable, reproducible, versioned).
**Consequence:** `scoreMatch()` is pure and unit-tested for boundaries/ordering/reproducibility;
`ALGORITHM_VERSION` stored on every match.

## D-009 — Virus scan adapter; mock flags EICAR; production forbids mock
**Choice:** `VirusScanner` interface; `mock` scanner flags the standard EICAR test signature (so
boundary tests prove rejection works) and passes clean files; a `clamav` adapter is provided.
The API refuses to boot when `NODE_ENV=production` + `ARS_RUNTIME=supabase` + `VIRUS_SCANNER=mock`.
**Why:** FR-02.4 ("production config must not default to skipping scans").

## D-010 — i18n = i18next; default `ja`; key-parity enforced by test
**Choice:** `react-i18next` with four catalogs (`ja`,`en`,`zh-CN`,`zh-TW`), `ja` default + fallback;
locale persisted to `localStorage` and sent as `Accept-Language` so server validation errors are
localized too. A unit test asserts all catalogs share identical key sets (FR-09.3).

## D-011 — Email verification: local mode auto-issues a deterministic token
Supabase Auth sends verification email in production. Local adapter exposes a verification token via
the register response **only in local mode** and a `/auth/verify` endpoint, so the flow is testable
without an email provider. Unverified users can authenticate but are flagged `email_verified=false`
and gated from sensitive actions where required. Documented in `docs/AI.md`/README.

## D-012 — E2E runs the real stack against PGlite + mocks
Playwright boots the real API (PGlite + local auth + mock AI/storage/scanner) and the built SPA,
seeds deterministic data, and drives the two required journeys. **Why:** real end-to-end without
external credentials. **Consequence:** `webServer` config in `playwright.config.ts` starts both.
