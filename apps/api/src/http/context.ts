import type { FastifyRequest } from 'fastify';
import type { UserRole } from '@ars/shared';
import { ANON, type RequestContext } from '../db/types.js';
import { forbidden, unauthorized } from '../errors.js';

export interface Principal {
  userId: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

/** Map an authenticated principal to the DB request context (RLS role + claims). */
export function contextFor(principal: Principal | null): RequestContext {
  return principal
    ? { role: 'authenticated', userId: principal.userId, email: principal.email }
    : ANON;
}

export function requireAuth(req: FastifyRequest): Principal {
  if (!req.principal) throw unauthorized();
  return req.principal;
}

export function requireRole(req: FastifyRequest, role: UserRole): Principal {
  const principal = requireAuth(req);
  if (principal.role !== role) {
    throw forbidden(`Requires role ${role}`, 'error.forbiddenRole');
  }
  return principal;
}
