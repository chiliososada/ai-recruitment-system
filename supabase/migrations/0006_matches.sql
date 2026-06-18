-- 0006 — match results: score + explainable breakdown + reason (FR-05.3/05.5)

create table match_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  breakdown jsonb not null,
  reason text not null,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  algorithm_version text not null references algorithm_versions (version),
  created_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index match_results_job_idx on match_results (job_id, score desc);
create index match_results_candidate_idx on match_results (candidate_id, score desc);
