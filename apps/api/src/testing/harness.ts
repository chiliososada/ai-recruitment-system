import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Locale, Session, UserRole } from '@ars/shared';
import { buildServer } from '../app.js';
import { loadConfig } from '../config.js';
import { applyMigrations } from '../db/migrate.js';
import { PgliteDb } from '../db/pglite.js';
import { buildDeps, type Deps } from '../deps.js';
import { SAMPLE_RESUME_TEXT, makeResumePdf } from './fixtures.js';

export interface TestApp {
  app: FastifyInstance;
  deps: Deps;
  close(): Promise<void>;
}

/**
 * Boot the real server against a fresh in-process Postgres + deterministic mocks.
 *
 * `envOverrides` is merged into the test env before config parsing, so a test can opt into
 * production-like behaviour (e.g. a low `RATE_LIMIT_MAX` to exercise throttling — BE-3) without
 * affecting the defaults every other suite relies on.
 */
export async function createTestApp(
  overrides: Partial<Deps> = {},
  envOverrides: Record<string, string> = {},
): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    ARS_RUNTIME: 'local',
    AI_PROVIDER: 'mock',
    EMBEDDING_PROVIDER: 'mock',
    VIRUS_SCANNER: 'mock',
    LOCAL_JWT_SECRET: 'test-secret-key',
    LOCAL_STORAGE_DIR: `.storage-test/${randomUUID()}`,
    ...envOverrides,
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
  opts: {
    role: UserRole;
    email?: string;
    displayName?: string;
    password?: string;
    locale?: Locale;
  } = {
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

/** Build a multipart/form-data body for a single `file` field and POST it. */
export function uploadResumeFile(
  t: TestApp,
  headers: Record<string, string>,
  file: { filename: string; mime: string; buffer: Buffer },
) {
  const boundary = `----ars${randomUUID().replace(/-/g, '')}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, file.buffer, tail]);
  return t.app.inject({
    method: 'POST',
    url: '/api/candidates/me/resume',
    headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
}

/** Upload a sample PDF resume for a seeker (drives the full parse + analysis pipeline). */
export async function uploadSampleResume(
  t: TestApp,
  user: TestUser,
  text: string = SAMPLE_RESUME_TEXT,
): Promise<void> {
  const pdf = await makeResumePdf(text);
  const res = await uploadResumeFile(t, user.headers, {
    filename: 'cv.pdf',
    mime: 'application/pdf',
    buffer: pdf,
  });
  if (res.statusCode !== 201)
    throw new Error(`resume upload failed (${res.statusCode}): ${res.body}`);
}

/** Create a company + an open public job for a company member. */
export async function createCompanyAndJob(
  t: TestApp,
  companyUser: TestUser,
  jobOverrides: Record<string, unknown> = {},
): Promise<{ companyId: string; jobId: string; job: Record<string, unknown> }> {
  const comp = await t.app.inject({
    method: 'POST',
    url: '/api/companies',
    headers: companyUser.headers,
    payload: {
      name: `Acme ${randomUUID().slice(0, 6)}`,
      industry: 'Tech',
      size: '11-50',
      location: 'Tokyo',
    },
  });
  if (comp.statusCode !== 201) throw new Error(`company create failed: ${comp.body}`);
  const companyId = comp.json().id;
  const jres = await t.app.inject({
    method: 'POST',
    url: `/api/companies/${companyId}/jobs`,
    headers: companyUser.headers,
    payload: {
      title: 'Full-Stack Engineer',
      category: 'Engineering',
      description: 'Build TypeScript, React and Node.js apps backed by PostgreSQL on AWS.',
      requiredSkills: ['TypeScript', 'React', 'Node.js'],
      preferredSkills: ['PostgreSQL', 'AWS'],
      minYears: 3,
      salaryMin: 6000000,
      salaryMax: 10000000,
      workStyle: 'hybrid',
      status: 'open',
      visibility: 'public',
      ...jobOverrides,
    },
  });
  if (jres.statusCode !== 201)
    throw new Error(`job create failed (${jres.statusCode}): ${jres.body}`);
  return { companyId, jobId: jres.json().id, job: jres.json() };
}
