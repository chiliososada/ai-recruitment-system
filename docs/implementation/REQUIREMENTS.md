# Requirements — AI Recruitment Matching System

Traceable breakdown of `CLAUDE_CODE_TASK.md`. Each requirement has a stable ID
used in `TASKS.md`, code comments, and `VERIFICATION.md`.

## Functional requirements

### FR-01 — Registration, authentication & authorization
- FR-01.1 Job-seekers and company recruiters register with email + password.
- FR-01.2 Auth via Supabase Auth in production; deterministic local JWT adapter for dev/test; email-verification flow with a locally testable path.
- FR-01.3 User profile + role model (`job_seeker`, `company_member`) protecting candidate privacy, company resources, admin actions.
- FR-01.4 Session restore, logout, unauthenticated/forbidden errors, protected routes, basic account settings.
- FR-01.5 RLS policies in migrations + cross-role / cross-tenant IDOR negative tests.

### FR-02 — Resume upload & parsing
- FR-02.1 React drag-and-drop + file-picker upload.
- FR-02.2 PDF and DOCX; max 10 MB per file.
- FR-02.3 Client + server validation of size, extension, MIME, empty file; unguessable storage paths.
- FR-02.4 Store in Supabase Storage (filesystem adapter locally); virus-scan adapter; mock clearly labelled; production config must not default to skipping scans.
- FR-02.5 Upload triggers text extraction + structured parsing; UI shows processing status, errors, retry.
- FR-02.6 Resume content is untrusted: no prompt-injection, tool calls, or secret leakage; LLM output schema-validated.

### FR-03 — AI skill analysis & career advice
- FR-03.1 LLM extracts ≥ technical skills, years, proficiency level, project/experience evidence.
- FR-03.2 Explicit structured JSON schema; parse failure/timeout/invalid response retryable + observable.
- FR-03.3 Frontend shows skills as list + radar chart; mobile-readable; loading/empty/error states.
- FR-03.4 Mid/long-term career direction + recommended learning areas; output follows current UI locale.
- FR-03.5 Persist model/prompt version, generation time, traceable metadata; logs must not store full resume or secrets.

### FR-04 — Company & job management
- FR-04.1 Company users create/edit company profile.
- FR-04.2 Job CRUD ≥ title/category, description, required/preferred skills, experience, salary range, location, work style, language requirements, public/private status.
- FR-04.3 Only company members modify their company/jobs; public lists never leak drafts/private jobs.
- FR-04.4 Shared client + server validation; i18n error messages.

### FR-05 — AI matching
- FR-05.1 pgvector (or equivalent) stores candidate + job embeddings with sensible indexes.
- FR-05.2 Vector recall first, then explainable score from skills/experience/explicit rules; LLM only for constrained rerank/explanation, never the sole unverifiable scorer.
- FR-05.3 Fit score normalized 0–100, stable boundaries, versioned algorithm, reproducible for identical input.
- FR-05.4 Re-generate embeddings + matches after resume analysis or job content change (no stale data).
- FR-05.5 Seeker sees recommended jobs; company sees ranked candidates per job with scores + short reasons.
- FR-05.6 Tests for score boundaries, ordering, permissions, no-candidates, vector failure, LLM failure.

### FR-06 — Talent search & detail
- FR-06.1 Company users browse talent, search/filter by skills, years, sensible criteria, with pagination + sorting.
- FR-06.2 AI-recommended talent visibly but accessibly highlighted.
- FR-06.3 Candidate detail shows only business-permitted data; raw resume download / contact / sensitive fields strictly authorized.
- FR-06.4 All filtering/pagination use DB queries; never pull all rows to the browser.

### FR-07 — Company & job browsing
- FR-07.1 Seekers browse company list, company detail, public jobs.
- FR-07.2 Search/filter by industry, company size, location; pagination, sorting, empty + error states.
- FR-07.3 Company detail correctly links its public jobs; no other-tenant or non-public data.

### FR-08 — Direct messaging & notifications
- FR-08.1 Seekers and authorized company members create conversations + send messages.
- FR-08.2 Supabase Realtime (or equivalent) updates; unread state + basic notifications.
- FR-08.3 Only conversation members read/write; RLS/API authz + negative tests.
- FR-08.4 Reject empty / over-long / duplicate messages; basic XSS protection; sending/failed/retry states.

### FR-09 — Internationalization
- FR-09.1 Default Japanese; support `ja`, `en`, `zh-CN`, `zh-TW`.
- FR-09.2 UI text, form validation, errors, empty states, key AI outputs switch language.
- FR-09.3 No hardcoded user-visible strings in components; missing-translation-key check/test.
- FR-09.4 Language switch keeps route + business state; persist user choice.

### FR-10 — Candidate comparison, interviews & recruitment management
- FR-10.1 Company users shortlist candidates and compare ≥2 side-by-side: skills, experience, match score, AI summary, key evidence.
- FR-10.2 Seekers apply / express interest in public jobs; companies manage only their own jobs' applications.
- FR-10.3 Minimal recruitment-stage management (applied, screening, interview, offer, hired, rejected); stage changes need authz + audit timestamps.
- FR-10.4 Company proposes interview time/mode/notes; seeker views + confirms/declines; status change triggers in-app notification.
- FR-10.5 Comparison must not expose sensitive fields to unauthorized companies; interview/application data has API/RLS IDOR negative tests.

## Non-functional / cross-cutting requirements (NFR)

- NFR-ARCH — TypeScript monorepo: React+TS SPA, Node+TS API, shared DTO/schema/enum package, Supabase migrations.
- NFR-DB — Versioned migrations, seed/fixtures, indexes, RLS, Storage policy, rollback notes; FKs, unique constraints, timestamps, delete strategy.
- NFR-AI — Swappable LLM + embedding providers; production impl and deterministic test mock share one interface.
- NFR-API — Consistent error structure, authz, pagination, sorting, request correlation ID; OpenAPI doc.
- NFR-UX — Desktop + mobile; loading/empty/success/error/retry; keyboard, semantic labels, contrast, accessible names; radar chart text equivalent.
- NFR-SEC — RLS + backend authz (not just hidden buttons); prompt-injection defense; schema-validate AI output; no secrets/PII/full-resume/full-prompt in logs; rate limiting; bounded retries.
- NFR-PERF — Pagination + indexes; avoid N+1, full-table pulls, frontend secret leakage.
- NFR-TEST — Unit, DB/RLS, API integration, frontend component/interaction, E2E (2 main paths), file-boundary, security-negative.
- NFR-DOC — README, API doc, AI doc, DB doc, deploy doc, non-sensitive seed for both E2E paths.
- NFR-GATES — install/lockfile, format-check, `git diff --check`, lint, typecheck, unit, integration, RLS/DB, E2E, production build, migration validation — all exit 0, recorded in `VERIFICATION.md`.

## Minimum data model (from §7)
profiles+roles · candidate profiles, resume files, parse jobs, skills, candidate_skills ·
companies, company_members · jobs, job_skills/requirements · embeddings + algorithm versions ·
match results (score + explanation) · conversations, conversation_members, messages, notifications ·
applications, shortlist/comparison records, interviews, recruitment stage history.
