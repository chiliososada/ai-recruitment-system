-- 0013: close the NULL-job_id gap in the shortlists uniqueness guarantee.
-- UNIQUE (company_id, candidate_id, job_id) never fires when job_id IS NULL
-- (SQL NULLs are distinct), so repeated "save candidate" without a job created
-- duplicate rows. Dedupe (keep the newest note) then enforce with a partial
-- unique index. Additive + idempotent.
delete from shortlists s
using shortlists d
where s.job_id is null
  and d.job_id is null
  and s.company_id = d.company_id
  and s.candidate_id = d.candidate_id
  and (s.created_at < d.created_at or (s.created_at = d.created_at and s.id < d.id));

create unique index if not exists shortlists_company_candidate_nulljob_key
  on shortlists (company_id, candidate_id)
  where job_id is null;
