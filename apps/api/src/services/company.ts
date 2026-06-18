import {
  buildPaginated,
  toLimitOffset,
  type Company,
  type CompanyMember,
  type CompanyMemberRole,
  type CompanySearchQuery,
  type CompanySize,
  type CreateCompanyInput,
  type Paginated,
  type UpdateCompanyInput,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import type { RequestContext } from '../db/types.js';
import { contextFor, type Principal } from '../http/context.js';
import { forbidden, notFound } from '../errors.js';
import { toIso } from '../util.js';

interface CompanyRow {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  size: CompanySize | null;
  location: string | null;
  website_url: string | null;
  created_at: unknown;
  updated_at: unknown;
  open_job_count?: number;
}

const ctx = (p: Principal): RequestContext => ({ role: 'authenticated', userId: p.userId, email: p.email });

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    size: row.size,
    location: row.location,
    websiteUrl: row.website_url,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.open_job_count !== undefined ? { openJobCount: Number(row.open_job_count) } : {}),
  };
}

const COMPANY_COLS = `id, name, description, industry, size, location, website_url, created_at, updated_at,
  (select count(*) from jobs j where j.company_id = companies.id and j.status = 'open' and j.visibility = 'public')::int as open_job_count`;

export async function createCompany(
  deps: Deps,
  principal: Principal,
  input: CreateCompanyInput,
): Promise<Company> {
  const row = await deps.db.withContext(ctx(principal), async (c) => {
    const created = await c.query<CompanyRow>(
      `insert into companies (name, description, industry, size, location, website_url)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, description, industry, size, location, website_url, created_at, updated_at`,
      [
        input.name,
        input.description ?? null,
        input.industry ?? null,
        input.size ?? null,
        input.location ?? null,
        input.websiteUrl ?? null,
      ],
    );
    const company = created.rows[0]!;
    await c.query(
      `insert into company_members (company_id, user_id, role) values ($1, $2, 'owner')`,
      [company.id, principal.userId],
    );
    return company;
  });
  return mapCompany({ ...row, open_job_count: 0 });
}

export async function listMyCompanies(deps: Deps, principal: Principal): Promise<Company[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<CompanyRow>(
      `select ${COMPANY_COLS} from companies
       where id in (select company_id from company_members where user_id = $1)
       order by created_at desc`,
      [principal.userId],
    ),
  );
  return res.rows.map(mapCompany);
}

export async function getCompany(
  deps: Deps,
  principal: Principal | null,
  companyId: string,
): Promise<Company> {
  const res = await deps.db.withContext(contextFor(principal), (c) =>
    c.query<CompanyRow>(`select ${COMPANY_COLS} from companies where id = $1`, [companyId]),
  );
  if (!res.rows.length) throw notFound('Company not found', 'company.notFound');
  return mapCompany(res.rows[0]!);
}

export async function updateCompany(
  deps: Deps,
  principal: Principal,
  companyId: string,
  input: UpdateCompanyInput,
): Promise<Company> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<CompanyRow>(
      `update companies set
         name = coalesce($2, name),
         description = coalesce($3, description),
         industry = coalesce($4, industry),
         size = coalesce($5, size),
         location = coalesce($6, location),
         website_url = coalesce($7, website_url)
       where id = $1
       returning id, name, description, industry, size, location, website_url, created_at, updated_at`,
      [
        companyId,
        input.name ?? null,
        input.description ?? null,
        input.industry ?? null,
        input.size ?? null,
        input.location ?? null,
        input.websiteUrl ?? null,
      ],
    ),
  );
  // RLS returns 0 rows when the caller is not a member of this company.
  if (!res.rows.length) throw forbidden('Cannot edit this company', 'error.forbidden');
  return mapCompany(res.rows[0]!);
}

export async function listCompanies(
  deps: Deps,
  principal: Principal | null,
  query: CompanySearchQuery,
): Promise<Paginated<Company>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const ph = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.q) {
    const p = ph(query.q);
    conditions.push(`(name ilike '%' || ${p} || '%' or coalesce(description, '') ilike '%' || ${p} || '%')`);
  }
  if (query.industry) conditions.push(`industry = ${ph(query.industry)}`);
  if (query.size) conditions.push(`size = ${ph(query.size)}::company_size`);
  if (query.location) {
    const p = ph(query.location);
    conditions.push(`location ilike '%' || ${p} || '%'`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const orderBy =
    query.sort === 'name'
      ? `lower(name) ${query.order}`
      : query.sort === 'jobs'
        ? `open_job_count ${query.order}, created_at desc`
        : `created_at ${query.order}`;
  const { limit, offset } = toLimitOffset(query);

  return deps.db.withContext(contextFor(principal), async (c) => {
    const total = await c.query<{ count: number }>(
      `select count(*)::int as count from companies ${where}`,
      params,
    );
    const rows = await c.query<CompanyRow>(
      `select ${COMPANY_COLS} from companies ${where} order by ${orderBy} limit ${limit} offset ${offset}`,
      params,
    );
    return buildPaginated(rows.rows.map(mapCompany), total.rows[0]?.count ?? 0, query);
  });
}

interface MemberRow {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyMemberRole;
  display_name: string;
  created_at: unknown;
}

export async function listMembers(
  deps: Deps,
  principal: Principal,
  companyId: string,
): Promise<CompanyMember[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<MemberRow>(
      `select cm.id, cm.company_id, cm.user_id, cm.role, p.display_name, cm.created_at
       from company_members cm join profiles p on p.id = cm.user_id
       where cm.company_id = $1 order by cm.created_at`,
      [companyId],
    ),
  );
  return res.rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    userId: r.user_id,
    role: r.role,
    displayName: r.display_name,
    email: '',
    createdAt: toIso(r.created_at),
  }));
}
