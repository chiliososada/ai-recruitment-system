import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { requireRole } from '../http/context.js';
import { getCandidatesForJob, getRecommendationsForSeeker } from '../services/matching.js';

export function registerMatchRoutes(app: FastifyInstance, deps: Deps): void {
  // Seeker: recommended jobs (FR-05.5).
  app.get('/candidates/me/recommendations', async (req) =>
    getRecommendationsForSeeker(deps, requireRole(req, 'job_seeker')),
  );

  // Company: ranked candidates for one of their jobs (FR-05.5, FR-06).
  app.get<{ Params: { id: string } }>('/jobs/:id/candidates', async (req) =>
    getCandidatesForJob(deps, requireRole(req, 'company_member'), req.params.id),
  );
}
