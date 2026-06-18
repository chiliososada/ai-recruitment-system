import type { FastifyInstance } from 'fastify';
import { TalentSearchQuerySchema } from '@ars/shared';
import type { Deps } from '../deps.js';
import { parseOrThrow } from '../errors.js';
import { requireRole } from '../http/context.js';
import { getCandidateDetail, searchTalent } from '../services/talent.js';

export function registerTalentRoutes(app: FastifyInstance, deps: Deps): void {
  // Company talent search with DB-side filter/sort/pagination (FR-06.1/06.4).
  app.get('/talent', async (req) =>
    searchTalent(
      deps,
      requireRole(req, 'company_member'),
      parseOrThrow(TalentSearchQuerySchema, req.query),
    ),
  );

  // Candidate detail; sensitive fields gated inside the service (FR-06.3).
  app.get<{ Params: { id: string } }>('/talent/:id', async (req) =>
    getCandidateDetail(deps, requireRole(req, 'company_member'), req.params.id),
  );
}
