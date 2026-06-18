# Tasks — durable ledger

Status legend: `TODO` · `IN_PROGRESS` · `DONE` · `BLOCKED_EXTERNAL`.
A task may only be `DONE` when code exists, tests cover it, the relevant command
passed, and evidence is recorded in `PROGRESS.md` / `VERIFICATION.md`.

## Phase 0 — Foundation (NFR-ARCH)
| ID | Task | Deps | Status | Acceptance / test |
|----|------|------|--------|-------------------|
| T-001 | git init, root scaffold (workspaces, tsconfig, prettier, eslint, .env.example, .gitignore) | — | DONE | files exist; `git` initialized |
| T-002 | implementation docs (REQUIREMENTS/TASKS/PROGRESS/DECISIONS/VERIFICATION) | — | IN_PROGRESS | files exist & updated each round |
| T-003 | `packages/shared`: enums, Zod DTO/schema, error shape, pagination, scoring core | T-001 | DONE | builds; 28 unit tests green (scoring + validation) |
| T-004 | DB adapter (PGlite local + `pg` prod) + per-request role/JWT tx for RLS | T-001 | DONE | `Db` iface + both impls; migrate-check boots |
| T-005 | Local test bootstrap SQL (auth shim, roles, storage shim) — local only | T-004 | DONE | bootstrap.sql applies on PGlite |
| T-006 | Root verify script orchestrating all gates | T-001 | TODO | `node scripts/verify.mjs` runs |

## Phase 1 — Database & migrations (NFR-DB, data model §7)
| ID | Task | Deps | Status | Acceptance / test |
|----|------|------|--------|-------------------|
| T-010 | Migration: extensions (pgvector), enums, profiles + roles | T-004 | DONE | applies; migrate-check verifies |
| T-011 | Migration: candidates, resume_files, parse_jobs, skills, candidate_skills, skill_analyses | T-010 | DONE | applies; FKs/indexes |
| T-012 | Migration: companies, company_members | T-010 | DONE | applies |
| T-013 | Migration: jobs, job_skills | T-012 | DONE | applies; range checks |
| T-014 | Migration: embeddings (+ivfflat index), algorithm_versions | T-011,T-013 | DONE | ivfflat verified |
| T-015 | Migration: match_results (score+explanation) | T-014 | DONE | applies |
| T-016 | Migration: conversations, conversation_members, messages, notifications | T-010 | DONE | applies |
| T-017 | Migration: applications, shortlists, candidate_comparisons, interviews, stage_history | T-013 | DONE | applies |
| T-018 | RLS policies for all tables (role + ownership + tenant) | T-010..T-017 | IN_PROGRESS | policies written + apply; RLS tests pending (T-071) |
| T-019 | Storage bucket + Storage policies (resumes) | T-011 | DONE | policy SQL applies on shim + Supabase |
| T-020 | seed.sql reference data + programmatic demo seed | T-010..T-017 | IN_PROGRESS | seed.sql applies; programmatic seed pending |

## Phase 2 — API (Node + Fastify + adapters)
| ID | Task | Deps | Status | Acceptance / test |
|----|------|------|--------|-------------------|
| T-030 | API skeleton: Fastify, config, error mapping, correlation ID, rate limit, OpenAPI | T-003,T-004 | DONE | boots; /health + /openapi.json; 10 auth integ tests |
| T-031 | Auth adapter (local JWT + supabase) + auth routes (register/login/verify/logout/me) [FR-01] | T-030 | DONE | 10 integration tests green |
| T-032 | Storage adapter (fs + supabase) + virus-scan adapter [FR-02] | T-030 | DONE | adapters written; boundary tests pending |
| T-033 | Resume upload + parse-job pipeline routes [FR-02] | T-031,T-032 | TODO | integration + boundary |
| T-034 | AI provider (mock + anthropic) + embedding provider (mock + openai) [FR-03/05] | T-003 | TODO | unit (schema, determinism) |
| T-035 | Skill analysis + career advice route + persistence [FR-03] | T-033,T-034 | TODO | integration |
| T-036 | Company CRUD + job CRUD routes [FR-04] | T-031 | TODO | integration + authz |
| T-037 | Matching engine (vector recall + rule score + rerank) + routes [FR-05] | T-034,T-013,T-014 | TODO | unit + integration |
| T-038 | Talent search + candidate detail routes [FR-06] | T-036,T-037 | TODO | integration + authz |
| T-039 | Company/job browse routes [FR-07] | T-036 | TODO | integration |
| T-040 | Messaging + notifications routes (+ realtime channel) [FR-08] | T-031 | TODO | integration + negative |
| T-041 | Applications, shortlist, comparison, interviews, stage history routes [FR-10] | T-036,T-037 | TODO | integration + negative |

## Phase 3 — Web (React + Vite + i18n)
| ID | Task | Deps | Status | Acceptance / test |
|----|------|------|--------|-------------------|
| T-050 | Web skeleton: Vite, router, query client, api client, auth context | T-030 | TODO | dev server boots |
| T-051 | i18n (i18next) + ja/en/zh-CN/zh-TW catalogs + locale persistence [FR-09] | T-050 | TODO | unit: key parity |
| T-052 | Auth pages: register/login/verify/account + protected routes [FR-01] | T-050,T-051 | TODO | component tests |
| T-053 | Resume upload + analysis (skills list + radar + states) [FR-02/03] | T-052 | TODO | component tests |
| T-054 | Job recommendations (seeker) + matches view [FR-05] | T-052 | TODO | component tests |
| T-055 | Company browse + company detail + public jobs (seeker) [FR-07] | T-052 | TODO | component tests |
| T-056 | Company console: company profile + job CRUD [FR-04] | T-052 | TODO | component tests |
| T-057 | Talent search + candidate detail + ranked candidates [FR-06/05] | T-056 | TODO | component tests |
| T-058 | Messaging UI + notifications [FR-08] | T-052 | TODO | component tests |
| T-059 | Shortlist + comparison + applications + interview workflow UI [FR-10] | T-056,T-057 | TODO | component tests |

## Phase 4 — Tests & quality gates (NFR-TEST, NFR-GATES)
| ID | Task | Deps | Status | Acceptance / test |
|----|------|------|--------|-------------------|
| T-070 | Unit tests: validation, authz, skill schema, scoring, i18n | T-003,T-034 | TODO | vitest green |
| T-071 | DB/RLS tests: seeker/company/other-company/anon allow+deny | T-018 | TODO | vitest green |
| T-072 | API integration: auth, upload, parse status, job CRUD, filter, match, message | T-03x | TODO | vitest green |
| T-073 | Frontend component/interaction tests | T-05x | TODO | vitest green |
| T-074 | E2E path 1 (seeker) + path 2 (company) via Playwright | T-05x | TODO | playwright green |
| T-075 | File-boundary tests: wrong type, >10MB, empty, malicious filename | T-033 | TODO | vitest green |
| T-076 | Security-negative: IDOR/cross-tenant, unauth, message authz, private-job leak | T-018,T-04x | TODO | vitest green |
| T-077 | Migration validation command | T-010..T-020 | TODO | applies clean from scratch |
| T-078 | Run full gate suite, record VERIFICATION.md | all | TODO | all exit 0 |

## Phase 5 — Documentation (NFR-DOC)
| ID | Task | Deps | Status | Acceptance / test |
|----|------|------|--------|-------------------|
| T-090 | README (architecture, prereqs, install, env, supabase, dev, test, build, deploy) | most | TODO | reviewer can run from zero |
| T-091 | API doc (endpoints, auth, req/resp, errors, pagination) + OpenAPI | T-030 | TODO | doc + /openapi.json |
| T-092 | AI doc (providers, schema, embeddings, scoring weights, versions, fallback, privacy) | T-034,T-037 | TODO | doc exists |
| T-093 | DB doc (tables, relations, RLS, Storage policy) + deploy doc | T-018,T-019 | TODO | doc exists |

> Update statuses only with real evidence. Current round: see `PROGRESS.md`.
