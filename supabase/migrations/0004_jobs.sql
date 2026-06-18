-- 0004 — jobs + job skills/requirements (FR-04)

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  category text not null,
  description text not null,
  min_years integer not null default 0,
  max_years integer,
  salary_min integer,
  salary_max integer,
  currency currency_code not null default 'JPY',
  location text,
  work_style work_style not null default 'onsite',
  languages text[] not null default '{}',
  status job_status not null default 'draft',
  visibility job_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_years_range check (max_years is null or max_years >= min_years),
  constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_max >= salary_min)
);
create index jobs_company_idx on jobs (company_id, created_at desc);
create index jobs_category_idx on jobs (category);
create index jobs_public_idx on jobs (created_at desc) where status = 'open' and visibility = 'public';
create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();

create table job_skills (
  job_id uuid not null references jobs (id) on delete cascade,
  skill_name text not null,
  display_name text not null,
  required boolean not null default true,
  weight numeric(3, 2) not null default 1.0,
  primary key (job_id, skill_name)
);
create index job_skills_name_idx on job_skills (skill_name);
