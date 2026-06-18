-- 0003 — companies + company members (FR-04, FR-07)

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  industry text,
  size company_size,
  location text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_industry_idx on companies (industry);
create index companies_size_idx on companies (size);
create index companies_name_idx on companies (lower(name));
create trigger companies_set_updated_at before update on companies
  for each row execute function set_updated_at();

create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role company_member_role not null default 'recruiter',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index company_members_user_idx on company_members (user_id);
create index company_members_company_idx on company_members (company_id);
