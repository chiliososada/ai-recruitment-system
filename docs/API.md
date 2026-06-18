# API Reference

The `@ars/api` service is a Fastify REST API. All application routes are served under the **`/api`**
prefix. Two endpoints sit outside that prefix:

- `GET /health` → `{ "status": "ok", "runtime": "local" | "supabase" }`
- `GET /openapi.json` → the generated OpenAPI 3 document (also describes the `bearerAuth` security
  scheme). Use it with any OpenAPI viewer/client generator.

---

## Conventions

### Base URL & content type

- Base path: `/api` (e.g. `POST /api/auth/login`). Paths below are written relative to that prefix.
- Requests and responses are JSON, except résumé upload (`multipart/form-data`) and résumé download
  (binary file stream).

### Authentication

- Auth uses a **Bearer JWT**: `Authorization: Bearer <token>`.
- Obtain a token from `POST /auth/register` or `POST /auth/login`; both return a session containing
  the access token and the user record.
- The token's claims (`sub`, `role`, `email`) are applied to the database transaction as
  `request.jwt.claims`, so RLS enforces ownership/tenancy in addition to the route's role check.
- Requests with a missing/invalid token are treated as anonymous; protected routes then return
  `401 UNAUTHORIZED`, and role-restricted routes return `403 FORBIDDEN` for the wrong role.

### Roles

Two user roles exist: `job_seeker` and `company_member`. Routes are annotated below with the
required role, or "auth" (any authenticated user) / "public" (no token required).

### Error envelope

Every non-2xx response uses one stable shape:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Validation failed",
    "messageKey": "error.validation",
    "details": [{ "path": "email", "message": "Invalid email" }],
    "correlationId": "f1c0…"
  }
}
```

- `code` — machine-readable enum (see table). `message` — human-readable English text.
- `messageKey` — optional i18n key the SPA uses to localize the message (FR-09); the client
  localizes by key rather than displaying the raw English string.
- `details` — optional array of field-level issues `{ path, message }` (validation errors).
- `correlationId` — echoes the request id; also returned in the `x-correlation-id` response header.

| `code` | HTTP | Meaning |
| ------ | ---- | ------- |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing/invalid token on a protected route |
| `FORBIDDEN` | 403 | Authenticated but not allowed (wrong role, not owner/tenant; also RLS denials) |
| `NOT_FOUND` | 404 | Resource missing or not visible to the caller |
| `CONFLICT` | 409 | Uniqueness/state conflict (e.g. duplicate registration) |
| `PAYLOAD_TOO_LARGE` | 413 | Upload exceeds the size limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Disallowed file type |
| `VALIDATION` | 422 | Body/query failed schema validation (`details` populated) |
| `VIRUS_DETECTED` | 422 | Uploaded file failed virus scan |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `UPSTREAM_AI_ERROR` | 502 | LLM/embedding provider failed after retries |
| `INTERNAL` | 500 | Unhandled server error |

### Correlation ID

Send `x-correlation-id` to trace a request; if absent the server generates a UUID. The value is
attached to logs and echoed back on every response (including errors and the SSE stream).

### Pagination & sorting

List endpoints accept `?page=&pageSize=&order=` (`page` ≥ 1 default 1; `pageSize` 1–100 default 20;
`order` `asc`|`desc` default `desc`) and return:

```json
{ "items": [ … ], "page": 1, "pageSize": 20, "total": 137, "totalPages": 7 }
```

`total`/`totalPages` come from a database `COUNT` — filtering, sorting, and pagination all execute
in SQL, never in the browser.

### Rate limiting

A global limit of **300 requests/minute** per client applies; auth endpoints
(`/auth/register`, `/auth/login`) are tightened to **20/minute**. Exceeding a limit returns
`429 RATE_LIMITED`. (Limits are effectively disabled when `NODE_ENV=test`.)

---

## Endpoints

### Auth

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `POST /auth/register` | public | Register a seeker or company member (email, password, role, display name, locale). Returns a session (201). In `local` runtime the response includes a dev email-verification token. |
| `POST /auth/login` | public | Authenticate; returns a session with the access token. |
| `POST /auth/verify-email` | public | Verify an email with a token (testable locally; Supabase Auth emails the link in production). |
| `POST /auth/logout` | public | Client-side logout acknowledgement (`{ ok: true }`); tokens are stateless. |
| `GET /auth/me` | auth | Current user + profile. |
| `PATCH /auth/account` | auth | Update basic account settings (e.g. display name, locale, password). |

### Candidate profile, résumé & analysis

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `GET /candidates/me` | job_seeker | Own candidate profile. |
| `PATCH /candidates/me` | job_seeker | Update own candidate profile (headline, summary, location, languages, desired salary, open-to-work…). |
| `POST /candidates/me/resume` | job_seeker | Upload a résumé (`multipart/form-data`, one file). Validates size/extension/MIME/non-empty, virus-scans, stores at an unguessable path, and triggers text extraction + parsing (201). |
| `GET /candidates/me/resumes` | job_seeker | List own résumé files and their scan/parse status. |
| `GET /candidates/me/parse-jobs/:id` | job_seeker | Status of a parse job (pending/processing/succeeded/failed). |
| `POST /candidates/me/parse-jobs/:id/retry` | job_seeker | Retry a failed parse. |
| `GET /candidates/me/analysis` | job_seeker | Latest persisted AI skill analysis (404 if none yet). |
| `POST /candidates/me/analysis` | job_seeker | (Re)generate analysis from the latest parsed résumé; optional `locale` body, otherwise the user's locale. Refreshes candidate skills + embedding. |
| `GET /resumes/:id/download` | auth | Download a résumé file (binary). Authorized to the owner, or a company member who has the candidate via an application or shortlist; otherwise `403`. |

### Companies

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `POST /companies` | company_member | Create a company (201). |
| `GET /companies` | public | Browse/search companies (filter by industry, size, location; paginated). |
| `GET /companies/mine` | company_member | Companies the caller belongs to. |
| `GET /companies/:id` | public | Company detail. |
| `PATCH /companies/:id` | company_member | Update a company (members only). |
| `GET /companies/:id/members` | company_member | List members of a company the caller belongs to. |
| `GET /companies/:id/jobs` | public | A company's **open + public** jobs only (paginated). |

### Jobs

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `GET /jobs` | public | Browse/search public, open jobs (paginated, sortable). Drafts/private jobs never appear. |
| `GET /jobs/:id` | public | Job detail (public jobs to anyone; private/draft only to its company members). |
| `GET /companies/:companyId/manage/jobs` | company_member | Company console — all jobs incl. drafts/private (members only). |
| `POST /companies/:companyId/jobs` | company_member | Create a job under a company (201). |
| `PATCH /jobs/:id` | company_member | Update a job (owning company only). |
| `DELETE /jobs/:id` | company_member | Delete a job (owning company only; 204). |

Job fields include title, category, description, required/preferred skills, experience range, salary
range + currency, location, work style, language requirements, status (`draft`/`open`/`closed`) and
visibility (`public`/`private`).

### Matching

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `GET /candidates/me/recommendations` | job_seeker | Recommended jobs for the seeker, with fit score (0–100), breakdown, and a short reason. |
| `GET /jobs/:id/candidates` | company_member | Ranked candidates for one of the company's jobs, with scores, matched/missing skills, and reasons. |

See [docs/AI.md](AI.md) for the scoring formula and algorithm version.

### Talent search & detail

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `GET /talent` | company_member | Search candidates open to work (filter by skills, years, etc.; DB-side filter/sort/pagination). |
| `GET /talent/:id` | company_member | Candidate detail. Sensitive fields are gated server-side by what the company is permitted to see. |

### Messaging & notifications

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `POST /conversations` | auth | Create a conversation (201). |
| `POST /conversations/with-company` | auth | Start (or reuse) a conversation with a company, optionally with subject + first message (201). |
| `GET /conversations` | auth | List the caller's conversations. |
| `GET /conversations/:id` | auth | Conversation detail (members only; 404 otherwise). |
| `GET /conversations/:id/messages` | auth | Messages in a conversation (members only). |
| `POST /conversations/:id/messages` | auth | Send a message. Rejects empty/over-long bodies; an optional `clientToken` de-dupes double submits (201). |
| `GET /conversations/:id/events` | auth | Server-Sent Events stream of new messages — the local equivalent of Supabase Realtime. |
| `GET /notifications` | auth | List the caller's notifications (with unread state). |
| `POST /notifications/:id/read` | auth | Mark one notification read (204). |
| `POST /notifications/read-all` | auth | Mark all read (204). |

### Applications, shortlist, comparison & interviews

| Method & path | Auth | Purpose |
| ------------- | ---- | ------- |
| `POST /applications` | job_seeker | Apply to a public job (201). |
| `GET /applications` | job_seeker | The seeker's own applications. |
| `GET /jobs/:id/applications` | company_member | Applications for one of the company's jobs. |
| `PATCH /applications/:id/stage` | auth | Change recruitment stage (company drives the pipeline; seekers may withdraw). Authorized + audit-logged. |
| `GET /applications/:id/history` | auth | Stage-change history (with timestamps and who changed it). |
| `POST /shortlists` | company_member | Add a candidate to the company shortlist (201). |
| `GET /shortlists` | company_member | List the company shortlist. |
| `DELETE /shortlists/:id` | company_member | Remove a shortlist entry (204). |
| `POST /compare` | company_member | Compare ≥2 candidates side by side: skills, experience, match score, AI summary, key evidence. |
| `POST /applications/:id/interviews` | company_member | Propose an interview (time, mode, notes) for an application (201). |
| `GET /applications/:id/interviews` | auth | Interviews for an application (visible to the candidate and the owning company). |
| `POST /interviews/:id/respond` | job_seeker | Confirm or decline a proposed interview; triggers an in-app notification. |

Recruitment stages: `applied`, `screening`, `interview`, `offer`, `hired`, `rejected`,
`withdrawn`. Comparison and detail endpoints never expose sensitive fields to companies that lack
access, and these routes are covered by API/RLS IDOR negative tests.
