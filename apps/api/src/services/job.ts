import {
  buildPaginated,
  normalizeSkill,
  toLimitOffset,
  type CreateJobInput,
  type Currency,
  type Job,
  type JobSearchQuery,
  type JobStatus,
  type JobVisibility,
  type Paginated,
  type UpdateJobInput,
  type WorkStyle,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import type { DbClient, RequestContext } from '../db/types.js';
import { forbidden, notFound } from '../errors.js';
import { contextFor, type Principal } from '../http/context.js';
import { escapeLike, parseList, pgArrayLiteral, toIso } from '../util.js';
import { regenerateJobEmbedding } from './embeddings.js';

interface JobRow {
  id: string;
  company_id: string;
  company_name?: string;
  title: string;
  category: string;
  description: string;
  min_years: number;
  max_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: Currency;
  location: string | null;
  work_style: WorkStyle;
  languages_text: string | null;
  status: JobStatus;
  visibility: JobVisibility;
  created_at: unknown;
  updated_at: unknown;
}

const ctx = (p: Principal): RequestContext => ({
  role: 'authenticated',
  userId: p.userId,
  email: p.email,
});

const JOB_COLS = `j.id, j.company_id, j.title, j.category, j.description, j.min_years, j.max_years,
  j.salary_min, j.salary_max, j.currency, j.location, j.work_style,
  array_to_string(j.languages, ',') as languages_text, j.status, j.visibility,
  j.created_at, j.updated_at, co.name as company_name`;

// For INSERT ... RETURNING (no join aliases available).
const JOB_RETURNING = `id, company_id, title, category, description, min_years, max_years,
  salary_min, salary_max, currency, location, work_style,
  array_to_string(languages, ',') as languages_text, status, visibility, created_at, updated_at`;

function mapJob(row: JobRow, required: string[], preferred: string[]): Job {
  return {
    id: row.id,
    companyId: row.company_id,
    ...(row.company_name ? { companyName: row.company_name } : {}),
    title: row.title,
    category: row.category,
    description: row.description,
    requiredSkills: required,
    preferredSkills: preferred,
    minYears: Number(row.min_years),
    maxYears: row.max_years === null ? null : Number(row.max_years),
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
    location: row.location,
    workStyle: row.work_style,
    languages: row.languages_text ? row.languages_text.split(',').filter(Boolean) : [],
    status: row.status,
    visibility: row.visibility,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function loadSkillsForJobs(
  c: DbClient,
  jobIds: string[],
): Promise<Map<string, { required: string[]; preferred: string[] }>> {
  const map = new Map<string, { required: string[]; preferred: string[] }>();
  if (jobIds.length === 0) return map;
  const res = await c.query<{ job_id: string; display_name: string; required: boolean }>(
    `select job_id, display_name, required from job_skills where job_id = any($1::uuid[])`,
    [pgArrayLiteral(jobIds)],
  );
  for (const id of jobIds) map.set(id, { required: [], preferred: [] });
  for (const r of res.rows) {
    const entry = map.get(r.job_id);
    if (entry) (r.required ? entry.required : entry.preferred).push(r.display_name);
  }
  return map;
}

async function writeJobSkills(
  c: DbClient,
  jobId: string,
  requiredSkills: string[],
  preferredSkills: string[],
): Promise<void> {
  await c.query(`delete from job_skills where job_id = $1`, [jobId]);
  const requiredNames = new Set(requiredSkills.map(normalizeSkill));
  const rows: { name: string; display: string; required: boolean }[] = [];
  for (const display of requiredSkills)
    rows.push({ name: normalizeSkill(display), display, required: true });
  for (const display of preferredSkills) {
    const name = normalizeSkill(display);
    if (!requiredNames.has(name)) rows.push({ name, display, required: false });
  }
  for (const r of rows) {
    await c.query(
      `insert into job_skills (job_id, skill_name, display_name, required)
       values ($1, $2, $3, $4)
       on conflict (job_id, skill_name) do update set display_name = excluded.display_name, required = excluded.required`,
      [jobId, r.name, r.display, r.required],
    );
  }
}

export async function createJob(
  deps: Deps,
  principal: Principal,
  companyId: string,
  input: CreateJobInput,
): Promise<Job> {
  const job = await deps.db.withContext(ctx(principal), async (c) => {
    const ins = await c.query<JobRow>(
      `insert into jobs (company_id, title, category, description, min_years, max_years,
         salary_min, salary_max, currency, location, work_style, languages, status, visibility)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13,$14)
       returning ${JOB_RETURNING}`,
      [
        companyId,
        input.title,
        input.category,
        input.description,
        input.minYears,
        input.maxYears,
        input.salaryMin,
        input.salaryMax,
        input.currency,
        input.location ?? null,
        input.workStyle,
        pgArrayLiteral(input.languages),
        input.status,
        input.visibility,
      ],
    );
    if (!ins.rows.length) throw forbidden('Cannot create job for this company', 'error.forbidden');
    const row = ins.rows[0]!;
    await writeJobSkills(c, row.id, input.requiredSkills, input.preferredSkills);
    return row;
  });
  await regenerateJobEmbedding(deps, job.id);
  return mapJob(job, input.requiredSkills, input.preferredSkills);
}

export async function updateJob(
  deps: Deps,
  principal: Principal,
  jobId: string,
  input: UpdateJobInput,
): Promise<Job> {
  await deps.db.withContext(ctx(principal), async (c) => {
    const upd = await c.query<{ id: string }>(
      `update jobs set
         title = coalesce($2, title),
         category = coalesce($3, category),
         description = coalesce($4, description),
         min_years = coalesce($5, min_years),
         max_years = case when $6::boolean then $7 else max_years end,
         salary_min = case when $8::boolean then $9 else salary_min end,
         salary_max = case when $10::boolean then $11 else salary_max end,
         currency = coalesce($12, currency),
         location = coalesce($13, location),
         work_style = coalesce($14, work_style),
         languages = coalesce($15::text[], languages),
         status = coalesce($16, status),
         visibility = coalesce($17, visibility)
       where id = $1
       returning id`,
      [
        jobId,
        input.title ?? null,
        input.category ?? null,
        input.description ?? null,
        input.minYears ?? null,
        input.maxYears !== undefined,
        input.maxYears ?? null,
        input.salaryMin !== undefined,
        input.salaryMin ?? null,
        input.salaryMax !== undefined,
        input.salaryMax ?? null,
        input.currency ?? null,
        input.location ?? null,
        input.workStyle ?? null,
        input.languages ? pgArrayLiteral(input.languages) : null,
        input.status ?? null,
        input.visibility ?? null,
      ],
    );
    if (!upd.rows.length) throw forbidden('Cannot edit this job', 'error.forbidden');
    if (input.requiredSkills || input.preferredSkills) {
      const current = await loadSkillsForJobs(c, [jobId]);
      const existing = current.get(jobId) ?? { required: [], preferred: [] };
      await writeJobSkills(
        c,
        jobId,
        input.requiredSkills ?? existing.required,
        input.preferredSkills ?? existing.preferred,
      );
    }
  });
  await regenerateJobEmbedding(deps, jobId);
  return getJob(deps, principal, jobId);
}

export async function deleteJob(deps: Deps, principal: Principal, jobId: string): Promise<void> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query(`delete from jobs where id = $1 returning id`, [jobId]),
  );
  if (!res.rows.length) throw forbidden('Cannot delete this job', 'error.forbidden');
}

export async function getJob(deps: Deps, principal: Principal | null, jobId: string): Promise<Job> {
  return deps.db.withContext(contextFor(principal), async (c) => {
    const res = await c.query<JobRow>(
      `select ${JOB_COLS} from jobs j join companies co on co.id = j.company_id where j.id = $1`,
      [jobId],
    );
    if (!res.rows.length) throw notFound('Job not found', 'job.notFound');
    const skills = await loadSkillsForJobs(c, [jobId]);
    const s = skills.get(jobId)!;
    return mapJob(res.rows[0]!, s.required, s.preferred);
  });
}

export async function listCompanyJobs(
  deps: Deps,
  principal: Principal,
  companyId: string,
): Promise<Job[]> {
  return deps.db.withContext(ctx(principal), async (c) => {
    const res = await c.query<JobRow>(
      `select ${JOB_COLS} from jobs j join companies co on co.id = j.company_id
       where j.company_id = $1 order by j.created_at desc`,
      [companyId],
    );
    const skills = await loadSkillsForJobs(
      c,
      res.rows.map((r) => r.id),
    );
    return res.rows.map((r) => {
      const s = skills.get(r.id) ?? { required: [], preferred: [] };
      return mapJob(r, s.required, s.preferred);
    });
  });
}

export async function listPublicJobs(
  deps: Deps,
  principal: Principal | null,
  query: JobSearchQuery,
): Promise<Paginated<Job>> {
  const conditions = [`j.status = 'open'`, `j.visibility = 'public'`];
  const params: unknown[] = [];
  const ph = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.q) {
    const p = ph(escapeLike(query.q));
    conditions.push(`(j.title ilike '%' || ${p} || '%' or j.description ilike '%' || ${p} || '%')`);
  }
  if (query.category) conditions.push(`j.category = ${ph(query.category)}`);
  if (query.workStyle) conditions.push(`j.work_style = ${ph(query.workStyle)}::work_style`);
  if (query.location)
    conditions.push(`j.location ilike '%' || ${ph(escapeLike(query.location))} || '%'`);
  if (query.companyId) conditions.push(`j.company_id = ${ph(query.companyId)}`);
  if (query.salaryMin !== undefined)
    conditions.push(`coalesce(j.salary_max, j.salary_min, 0) >= ${ph(query.salaryMin)}`);
  const skillList = parseList(query.skills).map(normalizeSkill);
  if (skillList.length) {
    conditions.push(
      `exists (select 1 from job_skills js where js.job_id = j.id and js.skill_name = any(${ph(pgArrayLiteral(skillList))}::text[]))`,
    );
  }
  const where = `where ${conditions.join(' and ')}`;
  const orderBy =
    query.sort === 'salary'
      ? `coalesce(j.salary_max, j.salary_min, 0) ${query.order}, j.created_at desc`
      : query.sort === 'title'
        ? `lower(j.title) ${query.order}`
        : `j.created_at ${query.order}`;
  const { limit, offset } = toLimitOffset(query);

  return deps.db.withContext(contextFor(principal), async (c) => {
    const total = await c.query<{ count: number }>(
      `select count(*)::int as count from jobs j ${where}`,
      params,
    );
    const rows = await c.query<JobRow>(
      `select ${JOB_COLS} from jobs j join companies co on co.id = j.company_id
       ${where} order by ${orderBy} limit ${limit} offset ${offset}`,
      params,
    );
    const skills = await loadSkillsForJobs(
      c,
      rows.rows.map((r) => r.id),
    );
    const items = rows.rows.map((r) => {
      const s = skills.get(r.id) ?? { required: [], preferred: [] };
      return mapJob(r, s.required, s.preferred);
    });
    return buildPaginated(items, total.rows[0]?.count ?? 0, query);
  });
}
