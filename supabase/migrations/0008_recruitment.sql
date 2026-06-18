-- 0008 — applications, stage history, shortlists, comparisons, interviews (FR-10)

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  stage recruitment_stage not null default 'applied',
  cover_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index applications_job_idx on applications (job_id, created_at desc);
create index applications_candidate_idx on applications (candidate_id, created_at desc);
create trigger applications_set_updated_at before update on applications
  for each row execute function set_updated_at();

create table application_stage_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  from_stage recruitment_stage,
  to_stage recruitment_stage not null,
  changed_by uuid not null references profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index application_stage_history_app_idx on application_stage_history (application_id, created_at);

create table shortlists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  note text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (company_id, candidate_id, job_id)
);
create index shortlists_company_idx on shortlists (company_id, created_at desc);

create table candidate_comparisons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  candidate_ids uuid[] not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index candidate_comparisons_company_idx on candidate_comparisons (company_id, created_at desc);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  proposed_by uuid not null references profiles (id),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  mode interview_mode not null,
  location text,
  notes text,
  status interview_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_application_idx on interviews (application_id, scheduled_at);
create trigger interviews_set_updated_at before update on interviews
  for each row execute function set_updated_at();
