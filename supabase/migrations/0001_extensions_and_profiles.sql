-- 0001 — extensions, enum types, shared trigger, profiles (FR-01.3, NFR-DB)

create extension if not exists vector;

create type user_role as enum ('job_seeker', 'company_member');
create type company_member_role as enum ('owner', 'recruiter');
create type work_style as enum ('onsite', 'hybrid', 'remote');
create type job_status as enum ('draft', 'open', 'closed');
create type job_visibility as enum ('public', 'private');
create type proficiency_level as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type parse_status as enum ('pending', 'processing', 'succeeded', 'failed');
create type company_size as enum ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+');
create type recruitment_stage as enum (
  'applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'
);
create type interview_mode as enum ('onsite', 'online', 'phone');
create type interview_status as enum ('proposed', 'confirmed', 'declined', 'cancelled', 'completed');
create type notification_type as enum (
  'message', 'application_received', 'application_status_changed',
  'interview_proposed', 'interview_updated', 'match_ready', 'system'
);
create type currency_code as enum ('JPY', 'USD', 'CNY', 'TWD', 'EUR');
create type locale_code as enum ('ja', 'en', 'zh-CN', 'zh-TW');
create type scan_result as enum ('clean', 'infected', 'error');

-- Auto-maintain updated_at on tables that have it.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profile row mirrors an auth user (profiles.id == auth user id). Holds only
-- non-sensitive identity (display name, role, locale). Email lives in auth.
create table profiles (
  id uuid primary key,
  role user_role not null,
  display_name text not null,
  locale locale_code not null default 'ja',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on profiles (role);

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
