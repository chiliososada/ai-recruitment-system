import {
  ALGORITHM_VERSION,
  buildMatchReason,
  scoreMatch,
  type MatchBreakdown,
  type MatchResult,
  type ProficiencyLevel,
  type ScoringCandidate,
  type ScoringJob,
  type WorkStyle,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import type { DbClient } from '../db/types.js';
import { forbidden } from '../errors.js';
import { contextFor, type Principal } from '../http/context.js';
import { getCandidateIdForUser } from './candidate.js';
import { toIso } from '../util.js';

const RECALL_LIMIT = 50;
// ivfflat is approximate; probe all lists (= the migration's `lists`) so recall is exact
// at MVP data sizes. Tune down for very large datasets in production.
const IVFFLAT_PROBES = 10;

interface CandidateScoringRow {
  years_experience: string | number;
  location: string | null;
  languages_text: string | null;
  desired_salary_min: number | null;
  desired_salary_max: number | null;
}

async function buildScoringCandidate(c: DbClient, candidateId: string): Promise<ScoringCandidate | null> {
  const base = await c.query<CandidateScoringRow>(
    `select years_experience, location, array_to_string(languages, ',') as languages_text,
            desired_salary_min, desired_salary_max
     from candidates where id = $1`,
    [candidateId],
  );
  const row = base.rows[0];
  if (!row) return null;
  const skills = await c.query<{ display_name: string; proficiency: ProficiencyLevel; years_experience: string | number }>(
    `select s.display_name, cs.proficiency, cs.years_experience
     from candidate_skills cs join skills s on s.id = cs.skill_id where cs.candidate_id = $1`,
    [candidateId],
  );
  return {
    yearsExperience: Number(row.years_experience),
    location: row.location,
    languages: row.languages_text ? row.languages_text.split(',').filter(Boolean) : [],
    desiredSalaryMin: row.desired_salary_min,
    desiredSalaryMax: row.desired_salary_max,
    skills: skills.rows.map((s) => ({
      name: s.display_name,
      proficiency: s.proficiency,
      yearsExperience: Number(s.years_experience),
    })),
  };
}

interface JobScoringRow {
  id: string;
  min_years: number;
  max_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  location: string | null;
  work_style: WorkStyle;
  languages_text: string | null;
}

async function buildScoringJobs(c: DbClient, jobIds: string[]): Promise<Map<string, ScoringJob>> {
  const map = new Map<string, ScoringJob>();
  if (jobIds.length === 0) return map;
  const jobs = await c.query<JobScoringRow>(
    `select id, min_years, max_years, salary_min, salary_max, location, work_style,
            array_to_string(languages, ',') as languages_text
     from jobs where id = any($1::uuid[])`,
    [`{${jobIds.join(',')}}`],
  );
  const skills = await c.query<{ job_id: string; display_name: string; required: boolean }>(
    `select job_id, display_name, required from job_skills where job_id = any($1::uuid[])`,
    [`{${jobIds.join(',')}}`],
  );
  const skillsByJob = new Map<string, { required: string[]; preferred: string[] }>();
  for (const j of jobs.rows) skillsByJob.set(j.id, { required: [], preferred: [] });
  for (const s of skills.rows) {
    const e = skillsByJob.get(s.job_id);
    if (e) (s.required ? e.required : e.preferred).push(s.display_name);
  }
  for (const j of jobs.rows) {
    const sk = skillsByJob.get(j.id) ?? { required: [], preferred: [] };
    map.set(j.id, {
      requiredSkills: sk.required,
      preferredSkills: sk.preferred,
      minYears: Number(j.min_years),
      maxYears: j.max_years === null ? null : Number(j.max_years),
      salaryMin: j.salary_min,
      salaryMax: j.salary_max,
      location: j.location,
      workStyle: j.work_style,
      languages: j.languages_text ? j.languages_text.split(',').filter(Boolean) : [],
    });
  }
  return map;
}

async function upsertMatch(
  c: DbClient,
  jobId: string,
  candidateId: string,
  similarity: number,
  candidate: ScoringCandidate,
  job: ScoringJob,
): Promise<void> {
  const result = scoreMatch(similarity, candidate, job);
  const breakdown: MatchBreakdown = result.breakdown;
  await c.query(
    `insert into match_results
       (job_id, candidate_id, score, breakdown, reason, matched_skills, missing_skills, algorithm_version, created_at)
     values ($1, $2, $3, $4::jsonb, $5, $6::text[], $7::text[], $8, now())
     on conflict (job_id, candidate_id) do update
       set score = excluded.score, breakdown = excluded.breakdown, reason = excluded.reason,
           matched_skills = excluded.matched_skills, missing_skills = excluded.missing_skills,
           algorithm_version = excluded.algorithm_version, created_at = now()`,
    [
      jobId,
      candidateId,
      result.score,
      JSON.stringify(breakdown),
      buildMatchReason(result),
      `{${result.matchedSkills.join(',')}}`,
      `{${result.missingSkills.join(',')}}`,
      ALGORITHM_VERSION,
    ],
  );
}

/** Recompute + persist matches for one candidate against open public jobs (FR-05.4). */
export async function computeMatchesForCandidate(deps: Deps, candidateId: string): Promise<number> {
  return deps.db.service(async (c) => {
    await c.query(`set local ivfflat.probes = ${IVFFLAT_PROBES}`);
    const candidate = await buildScoringCandidate(c, candidateId);
    if (!candidate) return 0;
    const recall = await c.query<{ job_id: string; similarity: number }>(
      `with cand as (select embedding from candidate_embeddings where candidate_id = $1)
       select je.job_id, 1 - (je.embedding <=> (select embedding from cand)) as similarity
       from job_embeddings je join jobs j on j.id = je.job_id
       where (select embedding from cand) is not null
         and j.status = 'open' and j.visibility = 'public'
       order by je.embedding <=> (select embedding from cand)
       limit $2`,
      [candidateId, RECALL_LIMIT],
    );
    if (recall.rows.length === 0) return 0;
    const jobs = await buildScoringJobs(c, recall.rows.map((r) => r.job_id));
    for (const r of recall.rows) {
      const job = jobs.get(r.job_id);
      if (job) await upsertMatch(c, r.job_id, candidateId, Number(r.similarity), candidate, job);
    }
    return recall.rows.length;
  });
}

/** Recompute + persist matches for one job against open-to-work candidates (FR-05.4/05.5). */
export async function computeMatchesForJob(deps: Deps, jobId: string): Promise<number> {
  return deps.db.service(async (c) => {
    await c.query(`set local ivfflat.probes = ${IVFFLAT_PROBES}`);
    const recall = await c.query<{ candidate_id: string; similarity: number }>(
      `with j as (select embedding from job_embeddings where job_id = $1)
       select ce.candidate_id, 1 - (ce.embedding <=> (select embedding from j)) as similarity
       from candidate_embeddings ce join candidates cd on cd.id = ce.candidate_id
       where (select embedding from j) is not null and cd.open_to_work = true
       order by ce.embedding <=> (select embedding from j)
       limit $2`,
      [jobId, RECALL_LIMIT],
    );
    if (recall.rows.length === 0) return 0;
    const jobs = await buildScoringJobs(c, [jobId]);
    const job = jobs.get(jobId);
    if (!job) return 0;
    for (const r of recall.rows) {
      const candidate = await buildScoringCandidate(c, r.candidate_id);
      if (candidate) await upsertMatch(c, jobId, r.candidate_id, Number(r.similarity), candidate, job);
    }
    return recall.rows.length;
  });
}

interface MatchRow {
  id: string;
  job_id: string;
  candidate_id: string;
  score: number;
  breakdown: MatchBreakdown;
  reason: string;
  matched_skills_text: string | null;
  missing_skills_text: string | null;
  algorithm_version: string;
  created_at: unknown;
  job_title?: string;
  company_id?: string;
  company_name?: string;
  candidate_name?: string;
  candidate_headline?: string | null;
}

function mapMatch(r: MatchRow): MatchResult {
  return {
    id: r.id,
    jobId: r.job_id,
    candidateId: r.candidate_id,
    score: Number(r.score),
    breakdown: r.breakdown,
    reason: r.reason,
    matchedSkills: r.matched_skills_text ? r.matched_skills_text.split(',').filter(Boolean) : [],
    missingSkills: r.missing_skills_text ? r.missing_skills_text.split(',').filter(Boolean) : [],
    algorithmVersion: r.algorithm_version,
    createdAt: toIso(r.created_at),
    ...(r.job_title ? { jobTitle: r.job_title } : {}),
    ...(r.company_id ? { companyId: r.company_id } : {}),
    ...(r.company_name ? { companyName: r.company_name } : {}),
    ...(r.candidate_name ? { candidateName: r.candidate_name } : {}),
    ...(r.candidate_headline !== undefined ? { candidateHeadline: r.candidate_headline } : {}),
  };
}

const MATCH_COLS = `mr.id, mr.job_id, mr.candidate_id, mr.score, mr.breakdown, mr.reason,
  array_to_string(mr.matched_skills, ',') as matched_skills_text,
  array_to_string(mr.missing_skills, ',') as missing_skills_text,
  mr.algorithm_version, mr.created_at`;

/** Job recommendations for the signed-in seeker (FR-05.5). */
export async function getRecommendationsForSeeker(
  deps: Deps,
  principal: Principal,
): Promise<MatchResult[]> {
  const candidateId = await getCandidateIdForUser(deps, principal.userId);
  await computeMatchesForCandidate(deps, candidateId);
  const res = await deps.db.withContext(contextFor(principal), (c) =>
    c.query<MatchRow>(
      `select ${MATCH_COLS}, j.title as job_title, j.company_id, co.name as company_name
       from match_results mr
       join jobs j on j.id = mr.job_id
       join companies co on co.id = j.company_id
       where mr.candidate_id = $1
       order by mr.score desc, mr.created_at desc limit $2`,
      [candidateId, RECALL_LIMIT],
    ),
  );
  return res.rows.map(mapMatch);
}

/** Ranked candidates for a job (company members only, FR-05.5/06). */
export async function getCandidatesForJob(
  deps: Deps,
  principal: Principal,
  jobId: string,
): Promise<MatchResult[]> {
  const member = await deps.db.service((c) =>
    c.query<{ ok: boolean }>(
      `select exists(select 1 from jobs j join company_members m on m.company_id = j.company_id
                     where j.id = $1 and m.user_id = $2) as ok`,
      [jobId, principal.userId],
    ),
  );
  if (!member.rows[0]?.ok) throw forbidden('Not a member of this job\'s company', 'error.forbidden');

  await computeMatchesForJob(deps, jobId);
  const res = await deps.db.withContext(contextFor(principal), (c) =>
    c.query<MatchRow>(
      `select ${MATCH_COLS}, p.display_name as candidate_name, cd.headline as candidate_headline
       from match_results mr
       join candidates cd on cd.id = mr.candidate_id
       join profiles p on p.id = cd.user_id
       where mr.job_id = $1
       order by mr.score desc, mr.created_at desc limit $2`,
      [jobId, RECALL_LIMIT],
    ),
  );
  return res.rows.map(mapMatch);
}
