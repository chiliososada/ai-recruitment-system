# Architecture Audit (pre-upgrade)

## Security
- helmet CSP **disabled** (`contentSecurityPolicy: false`) → enable a strict CSP + full security
  headers; verify clickjacking/`frame-ancestors`.
- File validation is extension + client MIME only → add **magic-byte** sniffing, oversized/
  zip-bomb DOCX guard, fail-closed on scanner error (already throws; add test).
- Tokens are app-signed JWT in `Authorization` header (no cookies) → CSRF low-risk; document.
  Storage paths already unguessable; add short-lived signed URL note + bucket policy review.
- Logger redacts known fields → centralize PII redaction + audit all sinks; add `npm audit`/
  secret-scan gate; add `docs/SECURITY.md` with threat model.

## Reliability / async
- Résumé parse → extraction → LLM analysis → embedding runs **inline in the HTTP request**
  (`runParse`). Single-process, no durability, no backoff, no dead-letter. → Move to a
  **DB-backed durable queue** with lease (`FOR UPDATE SKIP LOCKED`), attempts, exponential
  backoff, timeout, dead-letter, idempotency key, and a worker with graceful shutdown.
- Provider calls: analysis retries x3 but no timeout/circuit-breaker; embedding none. → wrap with
  timeout + bounded retry + circuit breaker + metrics; never double-apply side effects.
- No `/ready`; `/health` static. No graceful shutdown. → add readiness (DB check) + SIGTERM drain.

## Performance
- No code-splitting (single ~410 kB JS chunk); no bundle budget; no Lighthouse. → lazy routes +
  locale chunks + budget + Lighthouse CI.
- Index review needed for hot queries (jobs public list, talent search filters, messages by
  conversation, applications by job, match recall). Most have indexes; verify additive gaps.

## Observability
- Structured pino logs only; no metrics/tracing, no SLI/SLO, no runbook. → metrics/tracing adapter
  (local no-op, OTel/Prometheus/Sentry-ready), correlation across API/worker/DB, `OPERATIONS.md`/
  `RUNBOOK.md`.

## Database / data lifecycle
- Schema solid (FKs, unique, indexes, RLS, storage policy). Add job_queue table (additive),
  retention/deletion ops doc, account-deletion runbook. Migrations forward-only; keep additive.

## AI / matching
- `scoreMatch` versioned (`match-v1`), reproducible, pgvector recall. Preserve score semantics;
  any change must be a new version with traceability. Keep prompt-injection defenses + schema
  validation; add resilience + metrics.

## Deploy
- No Dockerfile/CI/SBOM. → multi-stage non-root Docker (api+web), GitHub Actions, compose for
  local deps, env matrix, rollback/runbook docs. No real deploy without authorization.
