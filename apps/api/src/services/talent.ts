import {
  buildPaginated,
  normalizeSkill,
  toLimitOffset,
  type CandidateDetail,
  type CandidateSkill,
  type Currency,
  type Locale,
  type Paginated,
  type ProficiencyLevel,
  type TalentSearchQuery,
  type TalentSummary,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import type { DbClient } from '../db/types.js';
import { forbidden, notFound } from '../errors.js';
import { contextFor, type Principal } from '../http/context.js';
import { parseList, pgArrayLiteral, toIso } from '../util.js';
import { getUserEmail } from './candidate.js';
import { companyCanAccessCandidate } from './resume.js';
import { computeMatchesForJob } from './matching.js';

interface TalentRow {
  id: string;
  user_id: string;
  headline: string | null;
  summary: string | null;
  location: string | null;
  years_experience: string | number;
  open_to_work: boolean;
  desired_salary_min: number | null;
  desired_salary_max: number | null;
  currency: Currency | null;
  languages_text: string | null;
  display_name: string;
  locale: Locale;
  has_resume: boolean;
  has_analysis: boolean;
  updated_at: unknown;
  match_score: number | null;
}

async function skillsForCandidates(c: DbClient, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const res = await c.query<{ candidate_id: string; display_name: string }>(
    `select cs.candidate_id, s.display_name
     from candidate_skills cs join skills s on s.id = cs.skill_id
     where cs.candidate_id = any($1::uuid[])
     order by cs.years_experience desc`,
    [pgArrayLiteral(ids)],
  );
  for (const r of res.rows) {
    const arr = map.get(r.candidate_id) ?? [];
    if (arr.length < 8) arr.push(r.display_name);
    map.set(r.candidate_id, arr);
  }
  return map;
}

function mapSummary(row: TalentRow, skills: string[], jobScoped: boolean): TalentSummary {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    headline: row.headline,
    summary: row.summary,
    location: row.location,
    yearsExperience: Number(row.years_experience),
    openToWork: row.open_to_work,
    desiredSalaryMin: row.desired_salary_min,
    desiredSalaryMax: row.desired_salary_max,
    currency: row.currency,
    locale: row.locale,
    languages: row.languages_text ? row.languages_text.split(',').filter(Boolean) : [],
    topSkills: skills,
    hasResume: row.has_resume,
    hasAnalysis: row.has_analysis,
    updatedAt: toIso(row.updated_at),
    recommended: jobScoped && row.match_score !== null,
    matchScore: row.match_score === null ? null : Number(row.match_score),
  };
}

export async function searchTalent(
  deps: Deps,
  principal: Principal,
  query: TalentSearchQuery,
): Promise<Paginated<TalentSummary>> {
  let jobScoped = false;
  if (query.recommendedForJobId) {
    const member = await deps.db.service((c) =>
      c.query<{ ok: boolean }>(
        `select exists(select 1 from jobs j join company_members m on m.company_id = j.company_id
                       where j.id = $1 and m.user_id = $2) as ok`,
        [query.recommendedForJobId, principal.userId],
      ),
    );
    if (!member.rows[0]?.ok)
      throw forbidden("Not a member of this job's company", 'error.forbidden');
    await computeMatchesForJob(deps, query.recommendedForJobId);
    jobScoped = true;
  }

  const conditions = ['c.open_to_work = true'];
  const params: unknown[] = [];
  const ph = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.q) {
    const p = ph(query.q);
    conditions.push(
      `(coalesce(c.headline,'') ilike '%' || ${p} || '%' or coalesce(c.summary,'') ilike '%' || ${p} || '%' or p.display_name ilike '%' || ${p} || '%')`,
    );
  }
  if (query.minYears !== undefined) conditions.push(`c.years_experience >= ${ph(query.minYears)}`);
  if (query.location) conditions.push(`c.location ilike '%' || ${ph(query.location)} || '%'`);
  const skillList = parseList(query.skills).map(normalizeSkill);
  if (skillList.length) {
    conditions.push(
      `exists(select 1 from candidate_skills cs join skills s on s.id = cs.skill_id
              where cs.candidate_id = c.id and s.name = any(${ph(pgArrayLiteral(skillList))}::text[]))`,
    );
  }
  const where = `where ${conditions.join(' and ')}`;
  // Count query uses only the filter params (it has no match-results join).
  const filterParams = [...params];

  const jobParam = jobScoped ? ph(query.recommendedForJobId) : null;
  const matchJoin = jobScoped
    ? `left join match_results mr on mr.candidate_id = c.id and mr.job_id = ${jobParam}`
    : '';
  const matchSelect = jobScoped ? 'mr.score as match_score' : 'null::int as match_score';

  const orderBy = jobScoped
    ? `match_score desc nulls last, c.updated_at desc`
    : query.sort === 'experience'
      ? `c.years_experience ${query.order}`
      : query.sort === 'name'
        ? `lower(p.display_name) ${query.order}`
        : `c.updated_at ${query.order}`;
  const { limit, offset } = toLimitOffset(query);

  return deps.db.withContext(contextFor(principal), async (c) => {
    const total = await c.query<{ count: number }>(
      `select count(*)::int as count from candidates c join profiles p on p.id = c.user_id ${where}`,
      filterParams,
    );
    const rows = await c.query<TalentRow>(
      `select c.id, c.user_id, c.headline, c.summary, c.location, c.years_experience, c.open_to_work,
              c.desired_salary_min, c.desired_salary_max, c.currency,
              array_to_string(c.languages, ',') as languages_text,
              p.display_name, p.locale,
              exists(select 1 from resume_files r where r.candidate_id = c.id) as has_resume,
              exists(select 1 from skill_analyses a where a.candidate_id = c.id) as has_analysis,
              c.updated_at, ${matchSelect}
       from candidates c join profiles p on p.id = c.user_id ${matchJoin}
       ${where} order by ${orderBy} limit ${limit} offset ${offset}`,
      params,
    );
    const skills = await skillsForCandidates(
      c,
      rows.rows.map((r) => r.id),
    );
    const items = rows.rows.map((r) => mapSummary(r, skills.get(r.id) ?? [], jobScoped));
    return buildPaginated(items, total.rows[0]?.count ?? 0, query);
  });
}

interface DetailRow extends TalentRow {
  total_years: string | number;
}

export async function getCandidateDetail(
  deps: Deps,
  principal: Principal,
  candidateId: string,
): Promise<CandidateDetail> {
  const detail = await deps.db.withContext(contextFor(principal), async (c) => {
    const res = await c.query<DetailRow>(
      `select c.id, c.user_id, c.headline, c.summary, c.location, c.years_experience, c.open_to_work,
              c.desired_salary_min, c.desired_salary_max, c.currency,
              array_to_string(c.languages, ',') as languages_text,
              p.display_name, p.locale,
              exists(select 1 from resume_files r where r.candidate_id = c.id) as has_resume,
              exists(select 1 from skill_analyses a where a.candidate_id = c.id) as has_analysis,
              c.updated_at, null::int as match_score
       from candidates c join profiles p on p.id = c.user_id
       where c.id = $1`,
      [candidateId],
    );
    if (!res.rows.length) return null;
    const skillRows = await c.query<{
      display_name: string;
      category: string | null;
      proficiency: ProficiencyLevel;
      years_experience: string | number;
      evidence_text: string | null;
    }>(
      `select s.display_name, s.category, cs.proficiency, cs.years_experience,
              array_to_string(cs.evidence, '||') as evidence_text
       from candidate_skills cs join skills s on s.id = cs.skill_id
       where cs.candidate_id = $1 order by cs.years_experience desc`,
      [candidateId],
    );
    return { row: res.rows[0]!, skillRows: skillRows.rows };
  });

  if (!detail) throw notFound('Candidate not found', 'error.notFound');

  const authorized =
    principal.role === 'company_member' &&
    (await companyCanAccessCandidate(deps, principal.userId, candidateId));

  let resumeDownloadUrl: string | null = null;
  if (authorized) {
    const latest = await deps.db.service((c) =>
      c.query<{ id: string }>(
        `select id from resume_files where candidate_id = $1 order by created_at desc limit 1`,
        [candidateId],
      ),
    );
    if (latest.rows[0]) resumeDownloadUrl = `/api/resumes/${latest.rows[0].id}/download`;
  }

  const skills: CandidateSkill[] = detail.skillRows.map((s) => ({
    name: s.display_name,
    category: s.category,
    proficiency: s.proficiency,
    yearsExperience: Number(s.years_experience),
    evidence: s.evidence_text ? s.evidence_text.split('||').filter(Boolean) : [],
  }));

  const {
    recommended: _recommended,
    matchScore: _matchScore,
    ...profile
  } = mapSummary(
    detail.row,
    skills.slice(0, 8).map((s) => s.name),
    false,
  );
  return {
    ...profile,
    skills,
    resumeDownloadUrl,
    contactEmail: authorized ? await getUserEmail(deps, detail.row.user_id) : null,
  };
}
