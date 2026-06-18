# Progress log

Newest round first. Each entry: what was done, files changed, commands run, result, next.

## Round 1 — Foundation scaffold
- **Done:** Read `CLAUDE_CODE_TASK.md`; checked tooling (Node 23, npm 10, git, docker, Supabase CLI 2.67). `git init`. Created monorepo root config + the 5 implementation docs.
- **Files:** `.gitignore`, `package.json`, `tsconfig.base.json`, `.prettierrc.json`, `.prettierignore`, `.npmrc`, `.eslintrc.cjs`, `.env.example`, `docs/implementation/{REQUIREMENTS,TASKS,PROGRESS,DECISIONS,VERIFICATION}.md`.
- **Commands:** `git init` (ok); tooling version checks (ok).
- **Baseline:** Repo was effectively empty (only the task prompt files). No prior install/test/build existed, so there is no pre-existing passing baseline to preserve — every gate result below is produced by this work.
- **Next:** De-risk PGlite + pgvector + RLS; build `packages/shared`.

## Round 2 — De-risk DB strategy + `@ars/shared` contract
- **Done:** Spiked PGlite (pinned 0.3.7 — it bundles pgvector; 0.4+ dropped it) proving in-process **pgvector cosine + ivfflat index + RLS via `SET LOCAL ROLE` + `request.jwt.claims`** all work — the hermetic test/DB strategy is validated (see D-004/D-005). Built the entire `@ars/shared` package: enums, error envelope, pagination, Zod schemas for auth/profile/company/job/resume/analysis/match/messaging/recruitment, the pure versioned scoring core (`scoreMatch`, `match-v1`), and prompt-safety utilities. Added `languages` to candidate profile so language matching is real.
- **Files:** `packages/shared/**` (package.json, tsconfigs, `src/enums.ts`, `src/errors.ts`, `src/pagination.ts`, `src/scoring.ts`, `src/prompt-safety.ts`, `src/index.ts`, `src/schemas/*.ts`, `src/scoring.test.ts`, `src/validation.test.ts`); `tsconfig.base.json` (dropped `composite`).
- **Commands & results:**
  - `npm install` → exit 0.
  - `npm run typecheck --workspace @ars/shared` → exit 0.
  - `npm run test --workspace @ars/shared` → exit 0, **28/28 tests pass** (10 scoring incl. boundary/ordering/reproducibility, 18 validation incl. upload boundaries + analysis-schema guards).
  - `npm run build --workspace @ars/shared` → exit 0, emits `dist/`.
- **Next:** DB adapter (PGlite/`pg`) + per-request role/JWT tx (T-004), local bootstrap SQL (T-005), and the versioned migrations with pgvector/RLS/Storage (Phase 1).
