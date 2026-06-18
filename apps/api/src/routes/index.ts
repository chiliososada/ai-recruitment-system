import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { registerAuthRoutes } from './auth.js';

/** Register every API route group under the /api prefix. */
export async function registerRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  registerAuthRoutes(app, deps);
}
