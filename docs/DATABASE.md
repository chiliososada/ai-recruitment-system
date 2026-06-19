# Database

PostgreSQL with the `pgvector` extension. The schema is defined by **forward-only, numbered SQL
migrations** in `supabase/migrations/`, which run identically on a real Supabase project and on the
in-process PGlite database used for local development and tests.

## How migrations are applied

- **Real Supabase / Postgres (`ARS_RUNTIME=supabase`):** only `supabase/migrations/*.sql`, in
  numeric order. Supabase provides the `auth` and `storage` schemas, helper functions, and the
  `authenticated`/`anon`/`service_role` roles natively.
- **Local PGlite (`ARS_RUNTIME=local`, default):** `supabase/local/bootstrap.sql` is applied
  **first** (it recreates those Supabase-provided pieces — see below), then the canonical
  migrations, then optionally the reference seed. This is fully automatic at API/test startup.

`supabase/local/bootstrap.sql` is **local-only** and is never applied to a real Supabase project. It
recreates the `auth.*` helper functions (`auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()`)
that read `request.jwt.claims`, the three roles, a local credential table (`auth.local_identities`,
used only by the local bcrypt auth adapter), and a minimal `storage.buckets`/`storage.objects` shim
so the Storage policies are exercised locally too.

---

## Tables by domain

### Identity (`0001`)
- **`profiles`** — one row per auth user (`profiles.id == auth user id`). Holds non-sensitive
  identity only: `role` (`job_seeker` | `company_member`), `display_name`, `locale`. Email lives in
  auth, not here.

This migration also defines the shared enum types (`user_role`, `work_style`, `job_status`,
`job_visibility`, `proficiency_level`, `recruitment_stage`, `interview_mode`, `interview_status`,
`notification_type`, `currency_code`, `locale_code`, `scan_result`, …) and the `set_updated_at()`
trigger function.

### Candidate (`0002`)
- **`candidates`** — candidate profile, 1:1 with `profiles` (`user_id` unique). Headline, summary,
  location, `years_experience`, `open_to_work`, languages, desired salary range + currency.
- **`resume_files`** — uploaded files for a candidate: filename, MIME, size, an unguessable
  `storage_path` (unique, never derived from the filename), `scan_result`, and `extracted_text`.
- **`parse_jobs`** — text-extraction/parsing tasks per résumé file with `status`, `attempts`, error.
- **`skills`** — canonical skill dictionary (`name` normalized lowercase + `display_name`,
  category).
- **`candidate_skills`** — candidate ↔ skill (PK `(candidate_id, skill_id)`) with proficiency,
  years, and evidence.
- **`skill_analyses`** — persisted AI analysis: full validated JSON in `result`, plus traceable
  metadata (`locale`, `model_provider`, `model_version`, `prompt_version`, `generated_at`).

### Company (`0003`)
- **`companies`** — name, description, industry, `size`, location, website.
- **`company_members`** — user ↔ company membership (`role` `owner` | `recruiter`; unique
  `(company_id, user_id)`).

### Jobs (`0004`)
- **`jobs`** — belongs to a company: title, category, description, experience range
  (`min_years`/`max_years`, with a check constraint), salary range + currency (check constraint),
  location, `work_style`, languages, `status` (`draft`/`open`/`closed`), `visibility`
  (`public`/`private`). A partial index covers public+open jobs.
- **`job_skills`** — per-job required/preferred skills (PK `(job_id, skill_name)`).

### Embeddings & matching (`0005`, `0006`)
- **`algorithm_versions`** — versioned scoring config; seeded with `match-v1` (weights, embedding
  provider/model/dimensions). Mirrors `ALGORITHM_VERSION` in `@ars/shared`.
- **`candidate_embeddings`** / **`job_embeddings`** — `vector(384)` per candidate/job, the
  `algorithm_version`, and a `source_hash`. Both have an `ivfflat (… vector_cosine_ops)` index.
- **`match_results`** — one row per `(job_id, candidate_id)` (unique): `score` (0–100, checked),
  `breakdown` JSON, `reason`, matched/missing skills, and `algorithm_version`. Indexed by
  `(job_id, score desc)` and `(candidate_id, score desc)`.

### Messaging & notifications (`0007`)
- **`conversations`** — optional `job_id`, subject, `created_by`, `last_message_at`.
- **`conversation_members`** — membership (PK `(conversation_id, user_id)`) with `last_read_at`.
- **`messages`** — body, `sender_user_id`, optional `client_token`; a unique
  `(conversation_id, sender_user_id, client_token)` de-dupes double submits.
- **`notifications`** — per-user typed notifications with `read_at` (partial unread index).

### Recruitment (`0008`)
- **`applications`** — one per `(job_id, candidate_id)` (unique) with current `stage`.
- **`application_stage_history`** — append-only audit of stage changes (`from`/`to`, `changed_by`,
  timestamp).
- **`shortlists`** — company-curated candidates (unique `(company_id, candidate_id, job_id)`).
- **`candidate_comparisons`** — saved side-by-side comparisons (`candidate_ids[]`).
- **`interviews`** — proposed interviews per application: `scheduled_at`, duration, `mode`,
  location, notes, `status`.

### Relationships at a glance

```
profiles ─1:1─ candidates ──< resume_files ──< parse_jobs
   │                │
   │                ├──< candidate_skills >── skills
   │                ├──< skill_analyses
   │                └──1:1 candidate_embeddings
   │
   ├──< company_members >── companies ──< jobs ──< job_skills
   │                                       └──1:1 job_embeddings
   │
   jobs ─< match_results >─ candidates
   jobs ─< applications >─ candidates ──< application_stage_history
   applications ──< interviews
   companies ──< shortlists / candidate_comparisons
   profiles ──< conversation_members >── conversations ──< messages
   profiles ──< notifications
```

Aggregate-owned rows cascade on delete from their owning row (e.g. deleting a candidate removes
its résumés, parse jobs, skills, analyses, and embedding). **Actor/author references to
`profiles(id)` do _not_ cascade** — `conversations.created_by`, `messages.sender_user_id`,
`application_stage_history.changed_by`, `interviews.proposed_by`, `shortlists.created_by`, and
`candidate_comparisons.created_by` use the default `RESTRICT`, so deleting a `profiles` row while
any of these exist raises a foreign-key violation. Account deletion is therefore an ordered
operator procedure (storage → authored/actor rows → candidate → membership → profile → auth user),
documented in [OPERATIONS.md](OPERATIONS.md#data-retention--account-deletion). Tables that mutate
carry `created_at`, many also `updated_at` (maintained by the `set_updated_at` trigger).

---

## Row Level Security model (`0009`)

RLS is the defense-in-depth layer: the API role check **and** the database both block cross-role /
cross-tenant / IDOR access. The API runs each request inside a transaction as `authenticated` (or
`anon`) with `request.jwt.claims` set, so these policies apply uniformly on Supabase and locally.

### Roles & privileges
- `anon` — unauthenticated. Granted `SELECT` only on public reference/browse tables: `companies`,
  `jobs`, `job_skills`, `skills`, `algorithm_versions`.
- `authenticated` — logged-in user. Granted CRUD on public tables, then constrained by per-table
  policies.
- `service_role` — `BYPASSRLS`; used by the API only for writes that have already been
  authorized in the service layer (e.g. persisting an analysis, inserting notifications, mediated
  résumé download).

### Helper functions (`SECURITY DEFINER`)
These answer ownership/membership questions without RLS recursion: `viewer_is_recruiter()`,
`viewer_is_company_role()`, `is_company_member(company)`, `owns_candidate(candidate)`,
`candidate_visible_to_recruiter(candidate)`, `candidate_readable(candidate)`, `job_company(job)`,
`job_readable(job)`, `is_conversation_member(conv)`, `conversation_owned(conv)`,
`application_company(app)`, `application_readable(app)`.

### Per-table policy summary

| Table | Read | Write |
| ----- | ---- | ----- |
| `profiles` | any authenticated user | insert/update only your own row (`id = auth.uid()`) |
| `candidates` | owner, or recruiter when `open_to_work`, or via application/shortlist | owner only |
| `resume_files`, `parse_jobs` | owner only | owner only (download for companies is mediated by the API + `service_role`) |
| `candidate_skills` | who can read the candidate | owner only |
| `skill_analyses` | who can read the candidate | service-written |
| `skills`, `algorithm_versions` | everyone (incl. `anon`) | reference, read-only |
| `companies` | everyone | insert by any company-role user; update/delete by members |
| `company_members` | yourself or fellow members | self-join or existing member |
| `jobs` | public+open to everyone; drafts/private only to members | members of the owning company |
| `job_skills` | when the job is readable | members of the owning company |
| `candidate_embeddings` | who can read the candidate | service-written |
| `job_embeddings` | when the job is readable (incl. `anon`) | service-written |
| `match_results` | the candidate, or members of the owning company | service-written |
| `conversations` | members or creator | creator inserts; members update |
| `conversation_members` | yourself or fellow members | self-add, or the conversation owner adds |
| `messages` | conversation members | sender must be self **and** a member |
| `notifications` | owner only | owner may update/delete; service inserts |
| `applications` | the candidate, or members of the owning company | candidate inserts; both sides update (stage) |
| `application_stage_history` | who can read the application | `changed_by = auth.uid()` + can read the application |
| `shortlists`, `candidate_comparisons` | members of the owning company | members; `created_by = auth.uid()` on insert |
| `interviews` | who can read the application | company member proposes; both sides update |

Cross-tenant `INSERT`/`UPDATE` that violates a `WITH CHECK` raises Postgres error `42501`, which the
API maps to `403 FORBIDDEN`. These rules are covered by RLS negative tests (`npm run test:rls`).

---

## Storage (`0010`)

- A single private bucket **`resumes`** (`SUPABASE_STORAGE_BUCKET`, default `resumes`).
- Path convention: `<owner_user_id>/<unguessable-uuid>.<ext>`. RLS on `storage.objects`:
  - `resumes_insert_own` — an authenticated user may upload only under their own `auth.uid()`
    folder.
  - `resumes_select_own` / `resumes_delete_own` — read/delete only objects they own.
- Locally the same policies run against the `storage` shim from `bootstrap.sql`; in production
  Supabase Storage enforces them. The filesystem storage adapter (local) keeps bytes under
  `LOCAL_STORAGE_DIR` (default `.storage`).

---

## Seed data

`supabase/seed.sql` contains only **non-sensitive reference data** (the skill dictionary) and is
safe to apply on both runtimes. Demo users, companies, jobs (with parsed résumé, analysis, and
embeddings) are created **programmatically** through the real services so hashes/embeddings stay
consistent:

```bash
npm run seed -w @ars/api
```

Demo logins: `seeker@example.com` / `recruiter@example.com`, password `passw0rd1`.

---

## Migrations, rollback & restore

- **Forward-only:** migrations are numbered SQL files applied in order and recorded in
  `ars_schema_migrations`; the runner is idempotent (already-applied files are skipped). There are
  no down-migrations.
- **Validate locally** before deploying — applies bootstrap + all migrations + seed to a fresh
  PGlite DB and asserts `pgvector` + `ivfflat` + RLS are present:

  ```bash
  npm run db:migrate:check
  ```

- **Roll back a bad change:** because migrations are forward-only, recover by either
  (a) restoring the database from a backup (on Supabase, use **Point-in-Time Recovery**), or
  (b) applying the full numbered migration set to a fresh database and restoring data. To reverse a
  change, add a **new** numbered migration that undoes it rather than editing a shipped file.
- **Local PGlite is ephemeral:** the in-process database is rebuilt from bootstrap + migrations on
  every API/test start, so there is nothing to roll back locally — restart and re-seed.
