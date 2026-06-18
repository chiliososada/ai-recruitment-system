import type { FastifyInstance } from 'fastify';
import { LoginSchema, RegisterSchema, UpdateAccountSchema, VerifyEmailSchema } from '@ars/shared';
import type { Deps } from '../deps.js';
import { parseOrThrow } from '../errors.js';
import { requireAuth } from '../http/context.js';
import * as authService from '../services/auth.js';

export function registerAuthRoutes(app: FastifyInstance, deps: Deps): void {
  const strict = {
    rateLimit: { max: deps.config.NODE_ENV === 'test' ? 100000 : 20, timeWindow: '1 minute' },
  };

  app.post('/auth/register', { config: strict }, async (req, reply) => {
    const session = await authService.register(deps, parseOrThrow(RegisterSchema, req.body));
    return reply.code(201).send(session);
  });

  app.post('/auth/login', { config: strict }, async (req) =>
    authService.login(deps, parseOrThrow(LoginSchema, req.body)),
  );

  app.post('/auth/verify-email', async (req) => {
    const { token } = parseOrThrow(VerifyEmailSchema, req.body);
    return authService.verifyEmail(deps, token);
  });

  app.post('/auth/logout', async () => ({ ok: true }));

  app.get('/auth/me', async (req) => authService.me(deps, requireAuth(req)));

  app.patch('/auth/account', async (req) =>
    authService.updateAccount(deps, requireAuth(req), parseOrThrow(UpdateAccountSchema, req.body)),
  );
}
