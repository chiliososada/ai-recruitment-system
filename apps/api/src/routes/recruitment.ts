import type { FastifyInstance } from 'fastify';
import {
  AddShortlistSchema,
  CompareRequestSchema,
  CreateApplicationSchema,
  ProposeInterviewSchema,
  RespondInterviewSchema,
  UpdateApplicationStageSchema,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import { parseOrThrow } from '../errors.js';
import { requireAuth, requireRole } from '../http/context.js';
import {
  addShortlist,
  applyToJob,
  compareCandidates,
  getStageHistory,
  listInterviews,
  listJobApplications,
  listMyApplications,
  listShortlist,
  proposeInterview,
  removeShortlist,
  respondInterview,
  updateApplicationStage,
} from '../services/recruitment.js';

export function registerRecruitmentRoutes(app: FastifyInstance, deps: Deps): void {
  // Applications (FR-10.2)
  app.post('/applications', async (req, reply) => {
    const app_ = await applyToJob(deps, requireRole(req, 'job_seeker'), parseOrThrow(CreateApplicationSchema, req.body));
    return reply.code(201).send(app_);
  });
  app.get('/applications', async (req) => listMyApplications(deps, requireRole(req, 'job_seeker')));
  app.get<{ Params: { id: string } }>('/jobs/:id/applications', async (req) =>
    listJobApplications(deps, requireRole(req, 'company_member'), req.params.id),
  );

  // Stage management (FR-10.3) — company drives the pipeline; seekers may withdraw.
  app.patch<{ Params: { id: string } }>('/applications/:id/stage', async (req) => {
    const principal = requireAuth(req);
    const { stage, note } = parseOrThrow(UpdateApplicationStageSchema, req.body);
    return updateApplicationStage(deps, principal, req.params.id, stage, note);
  });
  app.get<{ Params: { id: string } }>('/applications/:id/history', async (req) =>
    getStageHistory(deps, requireAuth(req), req.params.id),
  );

  // Shortlist + comparison (FR-10.1)
  app.post('/shortlists', async (req, reply) => {
    const entry = await addShortlist(deps, requireRole(req, 'company_member'), parseOrThrow(AddShortlistSchema, req.body));
    return reply.code(201).send(entry);
  });
  app.get('/shortlists', async (req) => listShortlist(deps, requireRole(req, 'company_member')));
  app.delete<{ Params: { id: string } }>('/shortlists/:id', async (req, reply) => {
    await removeShortlist(deps, requireRole(req, 'company_member'), req.params.id);
    return reply.code(204).send();
  });
  app.post('/compare', async (req) =>
    compareCandidates(deps, requireRole(req, 'company_member'), parseOrThrow(CompareRequestSchema, req.body)),
  );

  // Interviews (FR-10.4)
  app.post<{ Params: { id: string } }>('/applications/:id/interviews', async (req, reply) => {
    const interview = await proposeInterview(
      deps,
      requireRole(req, 'company_member'),
      req.params.id,
      parseOrThrow(ProposeInterviewSchema, req.body),
    );
    return reply.code(201).send(interview);
  });
  app.get<{ Params: { id: string } }>('/applications/:id/interviews', async (req) =>
    listInterviews(deps, requireAuth(req), req.params.id),
  );
  app.post<{ Params: { id: string } }>('/interviews/:id/respond', async (req) =>
    respondInterview(deps, requireRole(req, 'job_seeker'), req.params.id, parseOrThrow(RespondInterviewSchema, req.body)),
  );
}
