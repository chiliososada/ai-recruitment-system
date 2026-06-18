import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { registerAuthRoutes } from './auth.js';
import { registerCandidateRoutes } from './candidate.js';
import { registerCompanyRoutes } from './company.js';
import { registerJobRoutes } from './job.js';
import { registerMatchRoutes } from './match.js';
import { registerMessagingRoutes } from './messaging.js';
import { registerRecruitmentRoutes } from './recruitment.js';
import { registerTalentRoutes } from './talent.js';

/** Register every API route group under the /api prefix. */
export async function registerRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  registerAuthRoutes(app, deps);
  registerCandidateRoutes(app, deps);
  registerCompanyRoutes(app, deps);
  registerJobRoutes(app, deps);
  registerMatchRoutes(app, deps);
  registerTalentRoutes(app, deps);
  registerMessagingRoutes(app, deps);
  registerRecruitmentRoutes(app, deps);
}
