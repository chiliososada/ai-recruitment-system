import type { FastifyInstance } from 'fastify';
import {
  CompanySearchQuerySchema,
  CreateCompanySchema,
  JobSearchQuerySchema,
  UpdateCompanySchema,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import { parseOrThrow } from '../errors.js';
import { requireRole } from '../http/context.js';
import {
  createCompany,
  getCompany,
  listCompanies,
  listMembers,
  listMyCompanies,
  updateCompany,
} from '../services/company.js';
import { listPublicJobs } from '../services/job.js';

export function registerCompanyRoutes(app: FastifyInstance, deps: Deps): void {
  app.post('/companies', async (req, reply) => {
    const principal = requireRole(req, 'company_member');
    const company = await createCompany(deps, principal, parseOrThrow(CreateCompanySchema, req.body));
    return reply.code(201).send(company);
  });

  app.get('/companies', async (req) =>
    listCompanies(deps, req.principal, parseOrThrow(CompanySearchQuerySchema, req.query)),
  );

  app.get('/companies/mine', async (req) =>
    listMyCompanies(deps, requireRole(req, 'company_member')),
  );

  app.get<{ Params: { id: string } }>('/companies/:id', async (req) =>
    getCompany(deps, req.principal, req.params.id),
  );

  app.patch<{ Params: { id: string } }>('/companies/:id', async (req) =>
    updateCompany(deps, requireRole(req, 'company_member'), req.params.id, parseOrThrow(UpdateCompanySchema, req.body)),
  );

  app.get<{ Params: { id: string } }>('/companies/:id/members', async (req) =>
    listMembers(deps, requireRole(req, 'company_member'), req.params.id),
  );

  // Public list of a company's open+public jobs (FR-07.3).
  app.get<{ Params: { id: string } }>('/companies/:id/jobs', async (req) => {
    const query = parseOrThrow(JobSearchQuerySchema, { ...(req.query as object), companyId: req.params.id });
    return listPublicJobs(deps, req.principal, query);
  });
}
