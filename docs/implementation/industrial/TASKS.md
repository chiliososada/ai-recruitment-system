# Industrial Upgrade — Task Ledger

Status: `TODO` · `IN_PROGRESS` · `DONE` · `BLOCKED_EXTERNAL`. A task is `DONE` only with real code +
passing automated evidence recorded in `VERIFICATION.md`. Core items must all reach `DONE` (or a
documented `BLOCKED_EXTERNAL` with adapter + local verification) before `FINAL_STATUS: COMPLETE`.

## Phase IB — Industrial baseline (§3)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| IB-1 | Write industrial ledger (BASELINE/FEATURE_PARITY/TASKS/DESIGN_AUDIT/ARCHITECTURE_AUDIT/DECISIONS/VERIFICATION) | DONE | files exist |
| IB-2 | Record baseline gate run (exit codes + counts) | DONE | recorded in VERIFICATION.md |
| IB-3 | Pre-upgrade visual baseline screenshots (desktop+mobile) via Playwright + seed | DONE | screenshots saved under `apps/web/visual-baseline/` |

## Phase DS — Design system (§4.1/4.2)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| DS-1 | Semantic design tokens (color scales, neutrals, status, bg/text layers, border, shadow, radius, spacing 4/8, type scale, motion, z-index) as CSS variables + light/dark-ready | DONE | `tokens.css` + token unit test |
| DS-2 | Accessible primitives: Button, IconButton, Link, Input, Textarea, Select, Checkbox, Radio, Switch, FormField, FieldError, FileUpload | DONE | component tests (states) |
| DS-3 | Overlays/data: Card, StatCard, Badge, Avatar, Tooltip, Dropdown, Dialog, Drawer, Tabs, Pagination, DataTable, FilterBar, Toast, InlineAlert, Skeleton, Spinner, EmptyState, ErrorState, ConfirmDialog | DONE | component tests |
| DS-4 | Layout: AppShell, Sidebar, Topbar, MobileNav, PageHeader, SectionHeader; configurable brand | DONE | renders + responsive test |
| DS-5 | Icon set (tree-shakeable, no emoji) | DONE | lucide-react used |
| DS-6 | 404/403/500/offline pages + global + route error boundaries; i18n error mapping | DONE | component tests |

## Phase UI — Page refactor to design system (§4.3/4.4, §5)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| UI-1 | Seeker pages → DS (dashboard, résumé/analysis, recommendations, browse, applications) | DONE | screenshots + tests |
| UI-2 | Recruiter pages → DS (dashboard, company/job mgmt, talent search DataTable, candidate detail/compare, pipeline) | DONE | screenshots + tests |
| UI-3 | Public + auth + messaging + notifications → DS; loading/empty/error/retry everywhere | DONE | screenshots + tests |
| UI-4 | Responsive at 320/390/768/1024/1440; mobile data patterns; no console errors in E2E | DONE | visual + E2E |
| UI-5 | Forms: shared schema, dirty/leave-confirm/dup-submit/saving/success/conflict/field errors | DONE | component tests |
| UI-6 | Route-level code splitting + locale lazy-load | DONE | bundle budget |

## Phase A11Y — Accessibility (§6)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| A11Y-1 | axe (Playwright) scans on key pages — 0 critical/serious | DONE | a11y gate green |
| A11Y-2 | Keyboard-only completion of core flows; focus-visible; dialog focus trap | DONE | e2e keyboard test |

## Phase BE — Backend/API industrialization (§7)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| BE-1 | `/ready` (DB + critical deps) + version/commit on `/health`; graceful shutdown | DONE | integration test |
| BE-2 | Idempotency + concurrency hardening on writes (register/login/upload/message/apply/interview) | DONE | concurrency tests |
| BE-3 | Per-route rate limits; consistent timeouts/cancellation | DONE | integration test |
| BE-4 | OpenAPI ↔ routes contract test | DONE | contract test |

## Phase JOBS — Durable async tasks (§7)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| JOBS-1 | `job_queue` table (status, idempotency key, lease, attempts, run_after, backoff, error, dead_letter) migration | DONE | migrate-check |
| JOBS-2 | Worker: claim (SKIP LOCKED), exec, retry+expo-backoff, timeout, dead-letter, graceful shutdown | DONE | state-machine unit + integration |
| JOBS-3 | Résumé parse/analysis/embedding enqueued (not inline); parse-status API semantics preserved | DONE | resume.integration still green |

## Phase PROVIDER — External provider resilience (§7)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| PR-1 | Timeout + bounded retry + circuit breaker wrapper for LLM/embedding (+ virus scan) | DONE | unit (breaker), resilience integration |

## Phase SEC — Security (§9)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| SEC-1 | CSP + security headers; strict CORS allowlist; clickjacking; no debug/internal leak in prod | DONE | header test |
| SEC-2 | File hardening: magic-byte + zip-bomb/oversized DOCX guard; fail-closed scan | DONE | boundary tests |
| SEC-3 | Central PII redaction audited across logs/errors/traces | DONE | redaction unit |
| SEC-4 | `npm audit`/secret-scan gate (no unexplained high/critical) | DONE | scripted gate |
| SEC-5 | `docs/SECURITY.md` (threat model, trust boundaries, data classes, prod checklist) | DONE | doc exists |

## Phase OBS — Observability (§10)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| OBS-1 | Structured log field standard + metrics/tracing adapter (local no-op / OTel-ready) | DONE | unit + wired |
| OBS-2 | `docs/OPERATIONS.md` + `docs/RUNBOOK.md` (health, scaling, queue backlog, provider/DB failure, rollback, backup, incident) | DONE | docs exist |

## Phase DB — Database lifecycle (§8)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| DB-1 | Index review for hot queries (jobs list, talent search, messages, pipeline, match recall) — additive | DONE | migrate-check + benchmark |
| DB-2 | Retention/deletion + account-deletion ops doc (no fictional UI) | DONE | doc in OPERATIONS |

## Phase PERF — Performance (§11)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| PERF-1 | Frontend bundle budget + Lighthouse CI (public + auth pages) | DONE | gate green |
| PERF-2 | API/DB benchmark script (p50/p95) on seed data → `docs/PERFORMANCE.md` | DONE | repeatable script + doc |

## Phase VIS — Visual regression (§13.7)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| VIS-1 | Playwright screenshot harness: key pages @1440×900 + 390×844, 4 locales, seeded/clock-fixed | DONE | screenshots + assertions |

## Phase CICD — CI/CD + Docker + supply chain (§12)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| CICD-1 | GitHub Actions pipeline (all gates) | DONE | workflow file + dry validation |
| CICD-2 | Multi-stage non-root Dockerfiles (api, web) + healthcheck + compose for local deps | DONE | docker build (or documented) |
| CICD-3 | SBOM generation + dependency update policy | DONE | script/doc |

## Phase DOCS — Documentation (§12/§10)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| DOCS-1 | `docs/ARCHITECTURE.md`; update `README.md` + `docs/DEPLOY.md` for industrial setup | DONE | docs updated |

## Phase VERIFY — Final verification (§15)
| ID | Task | Status | Acceptance |
|----|------|--------|-----------|
| VR-1 | Full extended gate suite exits 0; VERIFICATION.md evidence; git status/diff/secret-scan clean | DONE | all green |

> Update statuses only with real evidence. Current round logged in DECISIONS/VERIFICATION.
