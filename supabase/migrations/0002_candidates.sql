-- 0002 — candidate domain: candidates, resume files, parse jobs, skills, analyses (FR-02/03)

create table candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  headline text,
  summary text,
  location text,
  years_experience numeric(4, 1) not null default 0,
  open_to_work boolean not null default true,
  languages text[] not null default '{}',
  desired_salary_min integer,
  desired_salary_max integer,
  currency currency_code,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_user_idx on candidates (user_id);
create index candidates_open_idx on candidates (open_to_work);
create trigger candidates_set_updated_at before update on candidates
  for each row execute function set_updated_at();

create table resume_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  filename text not null,
  mime text not null,
  size_bytes integer not null,
  -- Unguessable, server-generated storage path (FR-02.3). Never derived from filename.
  storage_path text not null unique,
  scan_result scan_result not null default 'clean',
  extracted_text text,
  created_at timestamptz not null default now()
);
create index resume_files_candidate_idx on resume_files (candidate_id, created_at desc);

create table parse_jobs (
  id uuid primary key default gen_random_uuid(),
  resume_file_id uuid not null references resume_files (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  status parse_status not null default 'pending',
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parse_jobs_candidate_idx on parse_jobs (candidate_id, created_at desc);
create index parse_jobs_status_idx on parse_jobs (status);
create trigger parse_jobs_set_updated_at before update on parse_jobs
  for each row execute function set_updated_at();

-- Canonical skill dictionary (name is normalized lowercase; display_name is human form).
create table skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  category text
);

create table candidate_skills (
  candidate_id uuid not null references candidates (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete cascade,
  proficiency proficiency_level not null,
  years_experience numeric(4, 1) not null default 0,
  evidence text[] not null default '{}',
  primary key (candidate_id, skill_id)
);
create index candidate_skills_skill_idx on candidate_skills (skill_id);

-- Persisted AI analysis with traceable metadata (FR-03.5). `result` holds the full
-- validated SkillAnalysisResult JSON. Logs never store the resume text or secrets.
create table skill_analyses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  summary text not null,
  total_years_experience numeric(4, 1) not null default 0,
  result jsonb not null,
  locale locale_code not null,
  model_provider text not null,
  model_version text not null,
  prompt_version text not null,
  generated_at timestamptz not null default now()
);
create index skill_analyses_candidate_idx on skill_analyses (candidate_id, generated_at desc);
