import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompanyAndJob,
  createTestApp,
  createUser,
  type TestApp,
  type TestUser,
} from '../src/testing/harness.js';

/**
 * BE-2 — idempotency & concurrency. Verifies the unique guards that protect duplicate writes hold
 * under concurrent identical requests: exactly one logical record results, the loser is a clean
 * dedupe/conflict (never a duplicate row, never a 500).
 *
 *  - applications: `unique (job_id, candidate_id)` (supabase/migrations/0008_recruitment.sql),
 *    surfaced by applyToJob as a 409 'application.duplicate'.
 *  - job_queue: enqueue is idempotent on the idempotency key (used by resume upload).
 */
let t: TestApp;
let seeker: TestUser;
let jobId: string;

beforeAll(async () => {
  t = await createTestApp();
  seeker = await createUser(t, { role: 'job_seeker', displayName: 'Concurrency Carol' });
  const company = await createUser(t, { role: 'company_member' });
  ({ jobId } = await createCompanyAndJob(t, company));
});
afterAll(async () => {
  await t.close();
});

describe('concurrent application apply (BE-2)', () => {
  it('collapses two simultaneous identical applies into exactly one record', async () => {
    const apply = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/applications',
        headers: seeker.headers,
        payload: { jobId, coverNote: 'Race me' },
      });

    // Fire both at once — the unique (job_id, candidate_id) constraint must arbitrate.
    const [a, b] = await Promise.all([apply(), apply()]);
    const statuses = [a.statusCode, b.statusCode].sort();

    // Exactly one winner (201) and one clean conflict (409) — never two creates, never a 500.
    expect(statuses).toEqual([201, 409]);

    const loser = a.statusCode === 409 ? a : b;
    const loserBody = loser.json() as { error: { code: string; messageKey: string } };
    expect(loserBody.error.code).toBe('CONFLICT');
    expect(loserBody.error.messageKey).toBe('application.duplicate');

    // Database holds exactly one application row for this (job, candidate).
    const candidateId = (
      await t.app.inject({ method: 'GET', url: '/api/candidates/me', headers: seeker.headers })
    ).json().id as string;
    const rows = await t.deps.db.service((c) =>
      c.query<{ count: number }>(
        `select count(*)::int as count from applications where job_id = $1 and candidate_id = $2`,
        [jobId, candidateId],
      ),
    );
    expect(rows.rows[0]?.count).toBe(1);
  });
});

describe('idempotent job enqueue under concurrency (BE-2)', () => {
  it('two concurrent enqueues with the same idempotency key yield a single job', async () => {
    const key = `resume-parse-race-${Date.now()}`;
    const [a, b] = await Promise.all([
      t.deps.jobs.enqueue('resume_parse', { parseJobId: 'x' }, { idempotencyKey: key }),
      t.deps.jobs.enqueue('resume_parse', { parseJobId: 'x' }, { idempotencyKey: key }),
    ]);

    // Exactly one of the two is the deduped follower; both resolve to the same job id.
    expect(a.id).toBe(b.id);
    expect([a.deduped, b.deduped].sort()).toEqual([false, true]);

    const rows = await t.deps.db.service((c) =>
      c.query<{ count: number }>(
        `select count(*)::int as count from job_queue where idempotency_key = $1`,
        [key],
      ),
    );
    expect(rows.rows[0]?.count).toBe(1);
  });
});
