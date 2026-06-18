-- ===========================================================================
-- LOCAL-ONLY bootstrap (D-006). Applied by the dev/test harness BEFORE the
-- canonical migrations. It recreates the pieces a real Supabase project already
-- provides (the `auth` + `storage` schemas, helper functions, and the
-- authenticated/anon/service_role roles) so the SAME migrations + RLS run on
-- in-process PGlite. This file is NEVER applied to a real Supabase project.
-- ===========================================================================

create schema if not exists auth;
create schema if not exists storage;

-- auth.* helpers read the JWT claims the API sets via set_config('request.jwt.claims').
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', 'anon');
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;

-- Local-only credential store used solely by the local JWT auth adapter.
-- Production uses Supabase Auth (GoTrue); this table does not exist there.
create table if not exists auth.local_identities (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  email_verified boolean not null default false,
  verification_token text,
  created_at timestamptz not null default now()
);

-- Minimal Storage shim so the canonical Storage policies (0010) apply + are testable locally.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;
