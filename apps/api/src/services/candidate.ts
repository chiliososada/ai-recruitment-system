import type { CandidateProfile, Currency, Locale, UpdateCandidateProfileInput } from '@ars/shared';
import type { Deps } from '../deps.js';
import type { RequestContext } from '../db/types.js';
import { notFound } from '../errors.js';
import type { Principal } from '../http/context.js';
import { pgArrayLiteral, toIso } from '../util.js';
import { regenerateCandidateEmbedding } from './embeddings.js';

interface CandidateRow {
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
}

function ctx(principal: Principal): RequestContext {
  return { role: 'authenticated', userId: principal.userId, email: principal.email };
}

async function topSkills(
  deps: Deps,
  context: RequestContext,
  candidateId: string,
): Promise<string[]> {
  const res = await deps.db.withContext(context, (c) =>
    c.query<{ display_name: string }>(
      `select s.display_name
       from candidate_skills cs join skills s on s.id = cs.skill_id
       where cs.candidate_id = $1
       order by cs.years_experience desc, s.display_name asc
       limit 8`,
      [candidateId],
    ),
  );
  return res.rows.map((r) => r.display_name);
}

function mapProfile(row: CandidateRow, skills: string[]): CandidateProfile {
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
  };
}

const PROFILE_SELECT = `
  select c.id, c.user_id, c.headline, c.summary, c.location, c.years_experience,
         c.open_to_work, c.desired_salary_min, c.desired_salary_max, c.currency,
         array_to_string(c.languages, ',') as languages_text,
         p.display_name, p.locale,
         exists(select 1 from resume_files r where r.candidate_id = c.id) as has_resume,
         exists(select 1 from skill_analyses a where a.candidate_id = c.id) as has_analysis,
         c.updated_at
  from candidates c join profiles p on p.id = c.user_id`;

/** Resolve a user's email across runtimes (local credential table / Supabase auth.users). */
export async function getUserEmail(deps: Deps, userId: string): Promise<string | null> {
  const table = deps.config.ARS_RUNTIME === 'supabase' ? 'auth.users' : 'auth.local_identities';
  const col = deps.config.ARS_RUNTIME === 'supabase' ? 'id' : 'user_id';
  const res = await deps.db.service((c) =>
    c.query<{ email: string }>(`select email from ${table} where ${col} = $1`, [userId]),
  );
  return res.rows[0]?.email ?? null;
}

export async function getUserLocale(deps: Deps, userId: string): Promise<Locale> {
  const res = await deps.db.service((c) =>
    c.query<{ locale: Locale }>(`select locale from profiles where id = $1`, [userId]),
  );
  return res.rows[0]?.locale ?? 'ja';
}

export async function getCandidateIdForUser(deps: Deps, userId: string): Promise<string> {
  const res = await deps.db.service(async (c) => {
    const found = await c.query<{ id: string }>(`select id from candidates where user_id = $1`, [
      userId,
    ]);
    if (found.rows[0]) return found.rows[0];
    const created = await c.query<{ id: string }>(
      `insert into candidates (user_id) values ($1) on conflict (user_id) do update set user_id = excluded.user_id returning id`,
      [userId],
    );
    return created.rows[0]!;
  });
  return res.id;
}

export async function getMyProfile(deps: Deps, principal: Principal): Promise<CandidateProfile> {
  const context = ctx(principal);
  await getCandidateIdForUser(deps, principal.userId);
  const res = await deps.db.withContext(context, (c) =>
    c.query<CandidateRow>(`${PROFILE_SELECT} where c.user_id = $1`, [principal.userId]),
  );
  const row = res.rows[0];
  if (!row) throw notFound('Candidate profile not found', 'error.notFound');
  return mapProfile(row, await topSkills(deps, context, row.id));
}

export async function updateMyProfile(
  deps: Deps,
  principal: Principal,
  input: UpdateCandidateProfileInput,
): Promise<CandidateProfile> {
  const context = ctx(principal);
  const candidateId = await getCandidateIdForUser(deps, principal.userId);
  const languages = input.languages ? pgArrayLiteral(input.languages) : null;
  const res = await deps.db.withContext(context, (c) =>
    c.query<CandidateRow>(
      `update candidates set
         headline = coalesce($2, headline),
         summary = coalesce($3, summary),
         location = coalesce($4, location),
         years_experience = coalesce($5, years_experience),
         open_to_work = coalesce($6, open_to_work),
         languages = coalesce($7::text[], languages),
         desired_salary_min = case when $8::boolean then $9 else desired_salary_min end,
         desired_salary_max = case when $10::boolean then $11 else desired_salary_max end,
         currency = coalesce($12, currency)
       where id = $1
       returning (select 1)`,
      [
        candidateId,
        input.headline ?? null,
        input.summary ?? null,
        input.location ?? null,
        input.yearsExperience ?? null,
        input.openToWork ?? null,
        languages,
        input.desiredSalaryMin !== undefined,
        input.desiredSalaryMin ?? null,
        input.desiredSalaryMax !== undefined,
        input.desiredSalaryMax ?? null,
        input.currency ?? null,
      ],
    ),
  );
  if (!res.rows.length) throw notFound('Candidate profile not found', 'error.notFound');
  await regenerateCandidateEmbedding(deps, candidateId);
  return getMyProfile(deps, principal);
}
