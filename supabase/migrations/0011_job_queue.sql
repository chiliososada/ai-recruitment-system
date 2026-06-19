-- 0011 — durable job queue (industrial upgrade, additive). Drives résumé parse/analysis
-- (FR-02) via a recoverable model: lease, attempts, exponential backoff, timeout, dead-letter,
-- idempotency. Worker-only: no `authenticated`/`anon` grants (service role bypasses RLS).

create type queue_job_status as enum ('queued', 'running', 'succeeded', 'dead');

create table job_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  idempotency_key text unique,
  status queue_job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Claim index: ready, queued jobs ordered by schedule.
create index job_queue_claim_idx on job_queue (run_after) where status = 'queued';
create index job_queue_status_idx on job_queue (status);
create index job_queue_kind_idx on job_queue (kind, created_at desc);

create trigger job_queue_set_updated_at before update on job_queue
  for each row execute function set_updated_at();

alter table job_queue enable row level security;
-- No policies for authenticated/anon → fully internal; only the service role (worker/API
-- trusted path) touches it.
grant select, insert, update, delete on job_queue to service_role;
