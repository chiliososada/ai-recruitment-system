import type { FastifyInstance } from 'fastify';
import { CreateJobSchema, JobSearchQuerySchema, UpdateJobSchema } from '@ars/shared';
import type { Deps } from '../deps.js';
import { parseOrThrow } from '../errors.js';
import { requireRole } from '../http/context.js';
import {
  createJob,
  deleteJob,
  getJob,
  listCompanyJobs,
  listPublicJobs,
  updateJob,
} from '../services/job.js';

export function registerJobRoutes(app: FastifyInstance, deps: Deps): void {
  // Public browse (FR-07).
  app.get('/jobs', async (req) =>
    listPublicJobs(deps, req.principal, parseOrThrow(JobSearchQuerySchema, req.query)),
  );

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req) =>
    getJob(deps, req.principal, req.params.id),
  );

  // Company console — all jobs incl. drafts/private (members only).
  app.get<{ Params: { companyId: string } }>('/companies/:companyId/manage/jobs', async (req) =>
    listCompanyJobs(deps, requireRole(req, 'company_member'), req.params.companyId),
  );

  app.post<{ Params: { companyId: string } }>('/companies/:companyId/jobs', async (req, reply) => {
    const principal = requireRole(req, 'company_member');
    const job = await createJob(deps, principal, req.params.companyId, parseOrThrow(CreateJobSchema, req.body));
    return reply.code(201).send(job);
  });

  app.patch<{ Params: { id: string } }>('/jobs/:id', async (req) =>
    updateJob(deps, requireRole(req, 'company_member'), req.params.id, parseOrThrow(UpdateJobSchema, req.body)),
  );

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    await deleteJob(deps, requireRole(req, 'company_member'), req.params.id);
    return reply.code(204).send();
  });
}
