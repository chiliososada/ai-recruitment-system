# Feature Parity — FR-01..FR-10 (functional freeze)

The upgrade must **preserve** every FR behavior, permission boundary, API contract, data
meaning, locale and main journey. This table maps each requirement to its implementation and the
automated regression evidence that proves it still works after each upgrade round. "Upgrade"
notes how the feature is hardened **without changing external behavior**.

| FR | Behavior (frozen) | Implementation | Upgrade (non-breaking) | Regression evidence |
|----|-------------------|----------------|------------------------|---------------------|
| FR-01 | Register/login/verify/logout/account; role + RLS authz | `services/auth.ts`, `adapters/auth/*`, `routes/auth.ts`; web auth pages + `ProtectedRoute` | brute-force/rate-limit hardening, security headers, design-system forms, a11y | `auth.integration` (10), `rls.rls` (18), `security-negative` (8), web `Login.test` |
| FR-02 | Résumé upload (PDF/DOCX ≤10MB), validation, virus scan, parse status + retry | `services/resume.ts`, `adapters/storage|virusscan|extract` | **durable job queue** for parse (lease/backoff/dead-letter), magic-byte + zip-bomb validation, signed URLs — same API/status semantics | `resume.integration` (8 incl. boundaries), new `jobqueue`/storage tests |
| FR-03 | AI skill analysis + career advice, schema-validated, locale-aware, model metadata | `services/analysis.ts`, `adapters/ai/*`, `schemas/analysis.ts` | provider timeout/circuit-breaker, metrics, prompt-injection tests — same output schema | `providers.unit` (9), `resume.integration`, new resilience tests |
| FR-04 | Company + job CRUD, shared validation, public/private | `services/company.ts|job.ts` | design-system forms, optimistic UX, contract tests — same DTOs | `company-job.integration` (10) |
| FR-05 | pgvector recall + versioned 0–100 score, reproducible | `scoring.ts` (`match-v1`), `services/matching.ts`, migration `0005` | score semantics unchanged + versioned; perf indexes; benchmarks | `scoring.test` (10), `matching.integration` (6) |
| FR-06 | Talent search (DB-side filter/sort/page), sensitive-field gating | `services/talent.ts` | DataTable UI, recommended highlight, a11y; gating preserved | `talent.integration` (5) |
| FR-07 | Public company/job browse, no leak of draft/private | `services/company.ts|job.ts` list | polished public pages, SEO/Lighthouse, no-leak preserved | `company-job.integration`, web `JobsBrowse.test` |
| FR-08 | Messaging + notifications, unread, dedupe, realtime-equiv | `services/messaging.ts`, `realtime.ts` (SSE) | reconnection UX, conversation list states, dedupe preserved | `messaging.integration` (8) |
| FR-09 | i18n ja/en/zh-CN/zh-TW, default ja, persisted, server messageKey | `apps/web/src/i18n/*`, `lib/errors.ts` | locale lazy-load, key-parity gate kept, long-text/RTL-safe layouts | `i18n.parity.test`, `LanguageSwitcher.test` |
| FR-10 | Shortlist/compare, applications pipeline + audit, interviews | `services/recruitment.ts` | pipeline visualization, batch within existing API, a11y | `recruitment.integration` (11) |

**Status:** Baseline preserved — all 138 tests green at `73b3e22`. This file is updated as each
upgrade lands to record that the corresponding regression suite still passes (commit + counts).
