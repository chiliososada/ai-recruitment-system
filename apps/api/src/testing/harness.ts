import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Locale, Session, UserRole } from '@ars/shared';
import { buildServer } from '../app.js';
import { loadConfig } from '../config.js';
import { applyMigrations } from '../db/migrate.js';
import { PgliteDb } from '../db/pglite.js';
import { buildDeps, type Deps } from '../deps.js';

export interface TestApp {
  app: FastifyInstance;
  deps: Deps;
  close(): Promise<void>;
}

/** Boot the real server against a fresh in-process Postgres + deterministic mocks. */
export async function createTestApp(overrides: Partial<Deps> = {}): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    ARS_RUNTIME: 'local',
    AI_PROVIDER: 'mock',
    EMBEDDING_PROVIDER: 'mock',
    VIRUS_SCANNER: 'mock',
    LOCAL_JWT_SECRET: 'test-secret-key',
    LOCAL_STORAGE_DIR: `.storage-test/${randomUUID()}`,
  });
  const db = overrides.db ?? (await PgliteDb.create());
  await applyMigrations(db, { bootstrap: true, seed: false });
  const deps = await buildDeps(config, { db, ...overrides });
  const app = await buildServer(deps);
  await app.ready();
  return {
    app,
    deps,
    async close() {
      await app.close();
      await db.close();
    },
  };
}

export interface TestUser extends Session {
  email: string;
  password: string;
  headers: { authorization: string };
}

let userCounter = 0;

/** Register a user via the real API and return the session + auth headers. */
export async function createUser(
  t: TestApp,
  opts: { role: UserRole; email?: string; displayName?: string; password?: string; locale?: Locale } = {
    role: 'job_seeker',
  },
): Promise<TestUser> {
  userCounter += 1;
  const email = opts.email ?? `user-${userCounter}-${randomUUID().slice(0, 8)}@example.com`;
  const password = opts.password ?? 'passw0rd1';
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      password,
      role: opts.role,
      displayName: opts.displayName ?? `User ${userCounter}`,
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
  });
  if (res.statusCode !== 201) throw new Error(`register failed (${res.statusCode}): ${res.body}`);
  const session = res.json() as Session;
  return {
    ...session,
    email,
    password,
    headers: { authorization: `Bearer ${session.accessToken}` },
  };
}

export const authHeader = (token: string): { authorization: string } => ({
  authorization: `Bearer ${token}`,
});
