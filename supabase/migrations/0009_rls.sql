-- 0009 — Row Level Security: grants, SECURITY DEFINER helpers, per-table policies.
-- This is the defense-in-depth layer required by §4/FR-01.5: the backend AND the DB
-- both block cross-role / cross-tenant / IDOR access. Helper functions are SECURITY
-- DEFINER to answer membership/ownership questions without RLS recursion.

-- ---- privileges -----------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to authenticated, service_role;
grant insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on companies, jobs, job_skills, skills, algorithm_versions to anon;

-- ---- helper functions -----------------------------------------------------
create or replace function public.viewer_is_recruiter() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where user_id = auth.uid());
$$;

create or replace function public.viewer_is_company_role() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'company_member');
$$;

create or replace function public.is_company_member(p_company uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = p_company and user_id = auth.uid());
$$;

create or replace function public.owns_candidate(p_candidate uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from candidates where id = p_candidate and user_id = auth.uid());
$$;

create or replace function public.candidate_visible_to_recruiter(p_candidate uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from applications a
    join jobs j on j.id = a.job_id
    join company_members m on m.company_id = j.company_id
    where a.candidate_id = p_candidate and m.user_id = auth.uid()
  ) or exists (
    select 1 from shortlists s
    join company_members m on m.company_id = s.company_id
    where s.candidate_id = p_candidate and m.user_id = auth.uid()
  );
$$;

create or replace function public.candidate_readable(p_candidate uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from candidates c
    where c.id = p_candidate
      and (c.user_id = auth.uid() or (c.open_to_work and public.viewer_is_recruiter()))
  ) or public.candidate_visible_to_recruiter(p_candidate);
$$;

create or replace function public.job_company(p_job uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select company_id from jobs where id = p_job;
$$;

create or replace function public.job_readable(p_job uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from jobs j
    where j.id = p_job
      and ((j.status = 'open' and j.visibility = 'public') or public.is_company_member(j.company_id))
  );
$$;

create or replace function public.is_conversation_member(p_conv uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = p_conv and user_id = auth.uid());
$$;

create or replace function public.conversation_owned(p_conv uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations where id = p_conv and created_by = auth.uid());
$$;

create or replace function public.application_company(p_app uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select j.company_id from applications a join jobs j on j.id = a.job_id where a.id = p_app;
$$;

create or replace function public.application_readable(p_app uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from applications a join jobs j on j.id = a.job_id
    where a.id = p_app
      and (public.owns_candidate(a.candidate_id) or public.is_company_member(j.company_id))
  );
$$;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- ---- enable RLS -----------------------------------------------------------
alter table profiles enable row level security;
alter table candidates enable row level security;
alter table resume_files enable row level security;
alter table parse_jobs enable row level security;
alter table skills enable row level security;
alter table candidate_skills enable row level security;
alter table skill_analyses enable row level security;
alter table companies enable row level security;
alter table company_members enable row level security;
alter table jobs enable row level security;
alter table job_skills enable row level security;
alter table algorithm_versions enable row level security;
alter table candidate_embeddings enable row level security;
alter table job_embeddings enable row level security;
alter table match_results enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table applications enable row level security;
alter table application_stage_history enable row level security;
alter table shortlists enable row level security;
alter table candidate_comparisons enable row level security;
alter table interviews enable row level security;

-- ---- profiles -------------------------------------------------------------
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_insert on profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---- candidates -----------------------------------------------------------
create policy candidates_select on candidates for select to authenticated
  using (public.candidate_readable(id));
create policy candidates_insert on candidates for insert to authenticated
  with check (user_id = auth.uid());
create policy candidates_update on candidates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- resume_files (owner only; company download mediated by API+service) --
create policy resume_files_select on resume_files for select to authenticated
  using (public.owns_candidate(candidate_id));
create policy resume_files_insert on resume_files for insert to authenticated
  with check (public.owns_candidate(candidate_id));
create policy resume_files_update on resume_files for update to authenticated
  using (public.owns_candidate(candidate_id)) with check (public.owns_candidate(candidate_id));
create policy resume_files_delete on resume_files for delete to authenticated
  using (public.owns_candidate(candidate_id));

-- ---- parse_jobs -----------------------------------------------------------
create policy parse_jobs_select on parse_jobs for select to authenticated
  using (public.owns_candidate(candidate_id));
create policy parse_jobs_insert on parse_jobs for insert to authenticated
  with check (public.owns_candidate(candidate_id));
create policy parse_jobs_update on parse_jobs for update to authenticated
  using (public.owns_candidate(candidate_id)) with check (public.owns_candidate(candidate_id));

-- ---- skills (reference, read-only to clients) -----------------------------
create policy skills_select on skills for select to anon, authenticated using (true);

-- ---- candidate_skills -----------------------------------------------------
create policy candidate_skills_select on candidate_skills for select to authenticated
  using (public.candidate_readable(candidate_id));
create policy candidate_skills_write on candidate_skills for all to authenticated
  using (public.owns_candidate(candidate_id)) with check (public.owns_candidate(candidate_id));

-- ---- skill_analyses (writes via service after authz) ----------------------
create policy skill_analyses_select on skill_analyses for select to authenticated
  using (public.candidate_readable(candidate_id));

-- ---- companies ------------------------------------------------------------
create policy companies_select on companies for select to anon, authenticated using (true);
create policy companies_insert on companies for insert to authenticated
  with check (public.viewer_is_company_role());
create policy companies_update on companies for update to authenticated
  using (public.is_company_member(id)) with check (public.is_company_member(id));
create policy companies_delete on companies for delete to authenticated
  using (public.is_company_member(id));

-- ---- company_members ------------------------------------------------------
create policy company_members_select on company_members for select to authenticated
  using (user_id = auth.uid() or public.is_company_member(company_id));
create policy company_members_insert on company_members for insert to authenticated
  with check (user_id = auth.uid() or public.is_company_member(company_id));
create policy company_members_delete on company_members for delete to authenticated
  using (public.is_company_member(company_id));

-- ---- jobs -----------------------------------------------------------------
create policy jobs_select on jobs for select to anon, authenticated
  using ((status = 'open' and visibility = 'public') or public.is_company_member(company_id));
create policy jobs_insert on jobs for insert to authenticated
  with check (public.is_company_member(company_id));
create policy jobs_update on jobs for update to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy jobs_delete on jobs for delete to authenticated
  using (public.is_company_member(company_id));

-- ---- job_skills -----------------------------------------------------------
create policy job_skills_select on job_skills for select to anon, authenticated
  using (public.job_readable(job_id));
create policy job_skills_write on job_skills for all to authenticated
  using (public.is_company_member(public.job_company(job_id)))
  with check (public.is_company_member(public.job_company(job_id)));

-- ---- algorithm_versions (reference) ---------------------------------------
create policy algorithm_versions_select on algorithm_versions for select to anon, authenticated using (true);

-- ---- embeddings (read by authorized viewers; written by service) ----------
create policy candidate_embeddings_select on candidate_embeddings for select to authenticated
  using (public.candidate_readable(candidate_id));
create policy job_embeddings_select on job_embeddings for select to anon, authenticated
  using (public.job_readable(job_id));

-- ---- match_results (read by candidate or owning company; written by service)
create policy match_results_select on match_results for select to authenticated
  using (public.owns_candidate(candidate_id) or public.is_company_member(public.job_company(job_id)));

-- ---- conversations / members / messages -----------------------------------
create policy conversations_select on conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversations_insert on conversations for insert to authenticated
  with check (created_by = auth.uid());
create policy conversations_update on conversations for update to authenticated
  using (public.is_conversation_member(id)) with check (public.is_conversation_member(id));

create policy conversation_members_select on conversation_members for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id));
create policy conversation_members_insert on conversation_members for insert to authenticated
  with check (user_id = auth.uid() or public.conversation_owned(conversation_id));
create policy conversation_members_update on conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy messages_select on messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy messages_insert on messages for insert to authenticated
  with check (sender_user_id = auth.uid() and public.is_conversation_member(conversation_id));

-- ---- notifications (owner only; created by service) -----------------------
create policy notifications_select on notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on notifications for delete to authenticated
  using (user_id = auth.uid());

-- ---- applications ---------------------------------------------------------
create policy applications_select on applications for select to authenticated
  using (public.owns_candidate(candidate_id) or public.is_company_member(public.job_company(job_id)));
create policy applications_insert on applications for insert to authenticated
  with check (public.owns_candidate(candidate_id));
create policy applications_update on applications for update to authenticated
  using (public.owns_candidate(candidate_id) or public.is_company_member(public.job_company(job_id)))
  with check (public.owns_candidate(candidate_id) or public.is_company_member(public.job_company(job_id)));

-- ---- application_stage_history --------------------------------------------
create policy stage_history_select on application_stage_history for select to authenticated
  using (public.application_readable(application_id));
create policy stage_history_insert on application_stage_history for insert to authenticated
  with check (changed_by = auth.uid() and public.application_readable(application_id));

-- ---- shortlists -----------------------------------------------------------
create policy shortlists_select on shortlists for select to authenticated
  using (public.is_company_member(company_id));
create policy shortlists_insert on shortlists for insert to authenticated
  with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy shortlists_update on shortlists for update to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy shortlists_delete on shortlists for delete to authenticated
  using (public.is_company_member(company_id));

-- ---- candidate_comparisons ------------------------------------------------
create policy comparisons_select on candidate_comparisons for select to authenticated
  using (public.is_company_member(company_id));
create policy comparisons_insert on candidate_comparisons for insert to authenticated
  with check (public.is_company_member(company_id) and created_by = auth.uid());
create policy comparisons_delete on candidate_comparisons for delete to authenticated
  using (public.is_company_member(company_id));

-- ---- interviews -----------------------------------------------------------
create policy interviews_select on interviews for select to authenticated
  using (public.application_readable(application_id));
create policy interviews_insert on interviews for insert to authenticated
  with check (proposed_by = auth.uid() and public.is_company_member(public.application_company(application_id)));
create policy interviews_update on interviews for update to authenticated
  using (public.application_readable(application_id)) with check (public.application_readable(application_id));
