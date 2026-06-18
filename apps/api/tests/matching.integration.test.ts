import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCompanyAndJob,
  createTestApp,
  createUser,
  uploadSampleResume,
  type TestApp,
  type TestUser,
} from '../src/testing/harness.js';

let t: TestApp;
let seeker: TestUser;
let company: TestUser;
let companyB: TestUser;
let jobId: string;

beforeAll(async () => {
  t = await createTestApp();
  seeker = await createUser(t, { role: 'job_seeker' });
  await uploadSampleResume(t, seeker);
  company = await createUser(t, { role: 'company_member' });
  companyB = await createUser(t, { role: 'company_member' });
  ({ jobId } = await createCompanyAndJob(t, company));
});
afterAll(async () => {
  await t.close();
});

describe('AI matching (FR-05)', () => {
  it('recommends the matching job to the seeker with a normalized score + reason', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/recommendations',
      headers: seeker.headers,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items.length).toBeGreaterThan(0);
    const match = items.find((m: { jobId: string }) => m.jobId === jobId);
    expect(match).toBeTruthy();
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(100);
    expect(match.score).toBeGreaterThan(50); // strong overlap
    expect(match.reason).toBeTruthy();
    expect(match.breakdown.skillScore).toBeGreaterThan(0);
    expect(match.matchedSkills).toEqual(expect.arrayContaining(['typescript']));
    expect(match.algorithmVersion).toBe('match-v1');
  });

  it('ranks candidates for the company job with scores', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/candidates`,
      headers: company.headers,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].candidateName).toBeTruthy();
    // sorted by score descending
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].score).toBeGreaterThanOrEqual(items[i].score);
    }
  });

  it('is reproducible across calls (FR-05.3)', async () => {
    const first = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/recommendations',
      headers: seeker.headers,
    });
    const second = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/recommendations',
      headers: seeker.headers,
    });
    const score = (r: typeof first) =>
      r.json().find((m: { jobId: string }) => m.jobId === jobId).score;
    expect(score(first)).toBe(score(second));
  });

  it('returns no recommendations for a seeker without a resume (no-candidates path)', async () => {
    const fresh = await createUser(t, { role: 'job_seeker' });
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/recommendations',
      headers: fresh.headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("forbids another company from viewing a job's candidates (403)", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/candidates`,
      headers: companyB.headers,
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires a seeker role for recommendations', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/recommendations',
      headers: company.headers,
    });
    expect(res.statusCode).toBe(403);
  });
});
