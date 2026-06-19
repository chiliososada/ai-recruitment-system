# Security

Threat model, trust boundaries, implemented controls, and the production security
checklist for the AI Recruitment System. This is a defense-in-depth design: the API
authorizes every request **and** Postgres Row Level Security re-checks the same rules
at the database (see [DATABASE.md](DATABASE.md)).

---

## Trust boundaries

```
 ┌──────────┐   HTTPS    ┌─────────────────┐   HTTPS    ┌────────────────────┐
 │ Browser  │ ─────────▶ │   SPA (static)  │            │  Node API (@ars/api)│
 │  (user)  │            │  nginx/CDN host │ ──────────▶│   Fastify 5         │
 └──────────┘            └─────────────────┘  bearer    └─────────┬───────────┘
   untrusted              serves JS/CSS only   JWT in              │ pg pool (TLS)
   input                  (no secrets)         Authorization       │ SET LOCAL ROLE
                                                                    ▼
                                              ┌──────────────────────────────────────┐
                                              │ Postgres (Supabase) + RLS + Storage    │
                                              │ External providers: Anthropic / OpenAI │
                                              │ ClamAV (clamd)                         │
                                              └──────────────────────────────────────┘
```

Boundaries crossed by data:

1. **Browser ↔ SPA** — the SPA is static, ships **no secrets**, and treats all user
   input as untrusted. The browser holds the app-issued JWT (in memory / web storage)
   and sends it as `Authorization: Bearer …`.
2. **SPA ↔ API** — cross-origin HTTPS calls governed by a strict CORS allowlist
   (`WEB_ORIGIN`). The API is the only component holding privileged credentials.
3. **API ↔ Database** — a TLS Postgres connection. The API never trusts the JWT
   alone: per request it opens a transaction, `SET LOCAL ROLE authenticated|anon`,
   sets `request.jwt.claims`, and lets RLS enforce ownership/tenancy.
4. **API ↔ Storage** — résumé bytes live in a private bucket; access is mediated by
   the API and storage RLS (objects keyed by owner `auth.uid()` + unguessable UUID).
5. **API ↔ AI/scan providers** — outbound calls to Anthropic/OpenAI/clamd wrapped in
   timeout + retry + circuit breaker; résumé text is the most sensitive payload sent.

---

## Data classification

| Class | Examples | Handling |
| ----- | -------- | -------- |
| **Secrets** | `LOCAL_JWT_SECRET`, `SUPABASE_*_KEY`, `SUPABASE_JWT_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL` | Never committed, never logged, never sent to the browser. Injected via env / secret manager. Rotatable (see below). |
| **PII** | Résumé text (`resume_files.extracted_text`), candidate email (in auth), display name, location, salary expectations, messages | Stored in Postgres protected by RLS; résumé bytes in a private bucket. Redacted from logs. Sent to AI providers only as needed for analysis/embeddings. |
| **Internal** | Match scores/breakdowns, parse-job state, queue rows | Service-written, RLS-scoped to the candidate / owning company. |
| **Public** | Companies, public+open jobs, job skills, skill dictionary, algorithm versions | Readable by `anon`; safe to cache/CDN. |

---

## Threat model (STRIDE)

| # | Threat (STRIDE) | Vector | Mitigation (implemented unless noted) |
| - | --------------- | ------ | ------------------------------------- |
| S1 | **Spoofing** — forged identity | Fake/tampered JWT | App-signed JWT verified on every request (`tokens.verify`); invalid → `principal = null`; Supabase tokens verified against `SUPABASE_JWT_SECRET`. |
| S2 | **Spoofing** — CSRF | Browser auto-sends ambient creds | **Low risk by design:** auth is a bearer token in the `Authorization` header (not a cookie), so cross-site forms cannot attach it. CORS is an allowlist; `credentials` is constrained to known origins. |
| T1 | **Tampering** — request/param tampering, IDOR | Guessing/altering ids, cross-tenant writes | Zod validation on all inputs; **RLS** re-checks ownership/tenancy in the DB; cross-tenant `WITH CHECK` violations raise Postgres `42501` → `403 FORBIDDEN`. Covered by RLS negative tests. |
| T2 | **Tampering** — malicious upload | Crafted/oversized/zip-bomb résumé, malware | Magic-byte sniffing (not just extension/MIME), size cap (`MAX_UPLOAD_BYTES`, single file), DOCX zip-bomb guard, virus scan (ClamAV) that **fails closed** on scanner error. |
| T3 | **Tampering** — supply chain | Malicious dependency / leaked secret | `scripts/scan-security.mjs` gate: `npm audit` (high/critical, allowlisted) + secret scan over tracked files; SBOM via `npm sbom`. Lockfile-pinned installs (`npm ci`). |
| R1 | **Repudiation** | Disputed actions | Append-only `application_stage_history` (`changed_by`, timestamp); structured logs with a per-request **correlation id** (`x-correlation-id`). |
| I1 | **Information disclosure** — log leakage | PII/secrets in logs | pino logger **redacts** PII/secret fields centrally; correlation ids, not payloads, are logged for tracing. |
| I2 | **Information disclosure** — cross-tenant read | Reading another tenant's data | RLS read policies per table (owner / company-member / application-scoped); `anon` may read only public reference/browse tables. |
| I3 | **Information disclosure** — direct object access | Guessing storage paths | Private bucket; paths are `<owner_uid>/<unguessable-uuid>.<ext>`; storage RLS scopes read/delete to the owner; company downloads are API-mediated via `service_role`. |
| I4 | **Information disclosure** — XSS exfiltration | Injected script reading the token | Strict SPA **CSP** (`script-src 'self'`, no inline JS), `X-Content-Type-Options: nosniff`; React escaping; no `dangerouslySetInnerHTML` of user data. |
| D1 | **DoS** — request flood | Brute force / scraping | Global rate limit (300 req/min/IP outside tests) via `@fastify/rate-limit`; upload size + field limits. |
| D2 | **DoS** — provider/queue overload | Slow or failing AI/scan providers | Resilience wrapper (timeout + bounded retry + **circuit breaker**); durable queue with attempts/backoff/dead-letter so failures don't block requests. |
| E1 | **Elevation of privilege** — role bypass | Acting as another role | Role checks in the service layer **and** RLS; `service_role` (BYPASSRLS) used only for already-authorized server-side writes. |
| E2 | **Elevation / abuse** — prompt injection | Malicious résumé text steering the LLM | Prompt-safety helpers in `@ars/shared` neutralize/segregate untrusted text; the model returns **schema-validated** JSON only (`skill_analyses.result`) — non-conforming output is rejected, never executed. See [AI.md](AI.md). |
| E3 | **Boot with insecure config** | Prod started with mock scanner / default secret | Boot guards refuse to start: `VIRUS_SCANNER=mock` rejected in prod+supabase; default `LOCAL_JWT_SECRET` rejected in prod; `supabase` runtime requires `DATABASE_URL`. |

---

## Implemented controls (summary)

- **Defense-in-depth authz** — service-layer role checks + Postgres RLS on every
  table; `42501` → `403`. Three roles (`anon`, `authenticated`, `service_role`).
- **Auth model** — app-signed JWT in `Authorization` header (no cookies) ⇒ CSRF is
  low-risk; CORS allowlist via `WEB_ORIGIN`.
- **API security headers (helmet)** — locked-down CSP for the JSON/SSE API
  (`default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`,
  `form-action 'none'`), `Referrer-Policy: no-referrer`, HSTS in production.
- **SPA security headers (nginx)** — see CSP below + `nosniff`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Permissions-Policy`.
- **Upload safety** — magic-byte sniff, size cap, DOCX zip-bomb guard, **fail-closed**
  virus scan (ClamAV INSTREAM).
- **PII log redaction** — centralized pino redaction; correlation-id tracing only.
- **Rate limiting** — 300 req/min/IP (outside tests).
- **Prompt-injection defenses + schema validation** — untrusted résumé text is
  segregated; LLM output must validate against the analysis schema.
- **Supply-chain / secret scanning** — `node scripts/scan-security.mjs` (CI gate);
  SBOM via `npm sbom --omit=dev` (CycloneDX-compatible).

### SPA Content-Security-Policy (from `infra/docker/nginx.conf`)

```
default-src 'self';
connect-src 'self' https://api.example.com;   ← set to the real API origin per env
img-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self';
font-src 'self' data:;
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

`connect-src` must include the API origin the SPA calls (same value as the build-time
`VITE_API_BASE_URL`); `'self'` alone is insufficient when the API is a different
origin. `style-src 'unsafe-inline'` is the only relaxation, required by injected
styles; scripts remain `'self'`-only (no inline JS).

---

## Secret management & rotation

- **Source of truth:** environment variables / a secret manager — never the repo.
  `.env.example` documents names only (no real values).
- **Rotation guidance:**
  - `LOCAL_JWT_SECRET` / `SUPABASE_JWT_SECRET` — rotating invalidates outstanding
    tokens (users re-authenticate). Rotate on suspected compromise and on a periodic
    schedule. Roll out by updating the secret and restarting API instances.
  - `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` — rotate from the Supabase
    dashboard, then update the API env and redeploy. The service-role key is highly
    privileged (BYPASSRLS) — treat as a top-tier secret.
  - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — rotate from the provider console; update
    env and redeploy. Scope/limit keys where the provider allows.
  - `DATABASE_URL` credentials — rotate the DB password, update the connection string,
    redeploy.
- **Hygiene:** least-privilege keys, separate secrets per environment
  (staging vs prod), and never log secret values (enforced by redaction + the secret
  scan gate). If a secret is ever committed, rotate it immediately — removing it from
  history is not sufficient.

---

## Dependency & secret scanning

- **`node scripts/scan-security.mjs`** (run in CI):
  - `npm audit --omit=dev --audit-level=high --json` — fails on high/critical
    advisories unless listed in `audit-allowlist.json` (reviewed, unfixable only).
  - Secret scan over `git ls-files` for AWS keys, PEM private keys, `sk-` OpenAI
    keys and Slack tokens, excluding `.env.example` and `docs/` examples.
- **SBOM:** generate with `npm sbom --omit=dev` (CycloneDX) and archive per release.
- Keep dependencies current; bump promptly when an advisory has a fix.

---

## Production security checklist

- [ ] `NODE_ENV=production`, `ARS_RUNTIME=supabase`.
- [ ] `LOCAL_JWT_SECRET` set to a strong, unique secret (default is rejected at boot).
- [ ] `VIRUS_SCANNER=clamav` with a reachable `clamd` (mock is rejected at boot).
- [ ] `AI_PROVIDER` / `EMBEDDING_PROVIDER` set to real providers (not `mock`).
- [ ] `WEB_ORIGIN` lists only the real SPA origin(s); no wildcards.
- [ ] All secrets injected from a secret manager; none in the image or repo.
- [ ] HTTPS/TLS terminated in front of both SPA and API; HSTS active (prod helmet).
- [ ] SPA CSP `connect-src` set to the real API origin.
- [ ] `npm ci` (lockfile), `node scripts/scan-security.mjs` green, SBOM archived.
- [ ] Storage bucket `resumes` is private with RLS policies applied (migration 0010).
- [ ] Rate limits and `MAX_UPLOAD_BYTES` reviewed for expected load.
- [ ] Backups / PITR enabled; restore tested (see [RUNBOOK.md](RUNBOOK.md)).
- [ ] Logs ship to a store with PII redaction verified; correlation ids retained.

---

## Vulnerability response process

1. **Report** — security issues to the maintainers privately (do not open a public
   issue with exploit detail). Include affected version/commit and reproduction.
2. **Triage & severity** — assess with STRIDE + CVSS-style impact within the trust
   boundaries above; assign a severity and an owner.
3. **Contain** — if actively exploited: rotate affected secrets, tighten/disable the
   affected path (e.g. rate limit, feature gate), and preserve logs (correlation ids).
4. **Fix & verify** — patch, add a regression test (unit/integration/RLS), run the
   full gate suite + `scan-security.mjs`.
5. **Release & rotate** — deploy the fix (see [DEPLOY.md](DEPLOY.md)); rotate any
   exposed credentials; archive an updated SBOM.
6. **Postmortem** — blameless writeup: timeline, root cause, detection gap, follow-ups.
   See the incident workflow in [RUNBOOK.md](RUNBOOK.md).
