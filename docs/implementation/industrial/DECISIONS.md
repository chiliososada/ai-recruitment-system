# Industrial Upgrade — Decisions

## ID-1 — Token-based design system with Radix primitives + lucide icons
CSS-variable semantic tokens (no runtime CSS-in-JS cost) + a small set of accessible **Radix**
headless primitives (Dialog, Dropdown, Tooltip, Tabs, Switch, Checkbox, Popover) wrapped with
tokenized styles; `lucide-react` for tree-shakeable icons. Avoids a heavy UI framework while
getting correct focus/keyboard/ARIA. Light/dark-ready tokens; brand configurable via tokens.

## ID-2 — Durable jobs on a DB-backed queue (not a new broker)
Add an additive `job_queue` table and an in-process worker using Postgres `FOR UPDATE SKIP LOCKED`
leasing with attempts/backoff/timeout/dead-letter/idempotency. Rationale: no extra infra (Redis/
SQS) for the MVP→SaaS step, works on Supabase Postgres, fully testable on PGlite, and the existing
`parse_jobs` status API is preserved (the queue drives it). Production guidance to scale workers
horizontally documented in OPERATIONS. **External behavior of FR-02 is unchanged.**

## ID-3 — Synchronous-in-test, async-in-prod job execution
The worker runs continuously in `serve`. In the deterministic test/local path the enqueue helper
can drain inline so existing `resume.integration` assertions (status `succeeded` on upload
response) keep passing without flaky polling. Same code path, controlled by an explicit
`processInline` flag — not a mock, not hidden.

## ID-4 — Provider resilience wrapper
A reusable `withResilience(fn, {timeout, retries, breaker})` wrapping LLM/embedding/scanner calls;
circuit breaker opens after N consecutive failures and short-circuits with a typed error mapped to
`UPSTREAM_AI_ERROR`. Metrics emitted via the observability adapter.

## ID-5 — Observability adapter, vendor-neutral
A `Metrics`/`Tracer` interface with a local no-op/console implementation and an OpenTelemetry-ready
implementation behind env config. No hard coupling to a single vendor.

## ID-6 — Security headers + CSP
Enable helmet with an explicit CSP suitable for the SPA + API; strict CORS allowlist (already);
`frame-ancestors 'none'`. Document CSRF stance (header-bearer tokens). File uploads validated by
magic bytes + size + zip-bomb guard, fail-closed on scan error.

## ID-7 — Visual regression with Playwright, seeded + clock-fixed
Deterministic seed + fixed clock + masked dynamic fields (timestamps only) → stable screenshot
assertions for key pages at 1440×900 and 390×844 across 4 locales. No large masks hiding layout.

## ID-8 — CI/CD + Docker, no real deploy
GitHub Actions runs the full gate matrix; multi-stage non-root Dockerfiles + compose for local
deps; SBOM via `npm sbom`/CycloneDX. No push/deploy/cloud resource without explicit authorization.

## ID-9 — Backward compatibility first
All DB changes additive + versioned; API DTOs/routes unchanged (additions only, e.g. `/ready`);
existing tests' assertions are not weakened. Any semantic change would be versioned with a
compatibility layer + contract test (none required so far).
