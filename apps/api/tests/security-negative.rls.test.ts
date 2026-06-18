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
let seeker: TestUser; // owns a resume + an application/conversation
let strangerSeeker: TestUser; // a different, unrelated seeker
let companyA: TestUser; // owns jobA + a private draft job
let companyB: TestUser; // a different company, must not see A's data
let jobA: string;
let draftJobId: string;
let resumeId: string;
let conversationId: string;

const get = (url: string, u?: TestUser) =>
  t.app.inject({ method: 'GET', url, ...(u ? { headers: u.headers } : {}) });

beforeAll(async () => {
  t = await createTestApp();

  seeker = await createUser(t, { role: 'job_seeker', displayName: 'Aoi' });
  strangerSeeker = await createUser(t, { role: 'job_seeker', displayName: 'Nosy' });
  await uploadSampleResume(t, seeker);

  companyA = await createUser(t, { role: 'company_member', displayName: 'Recruiter A' });
  companyB = await createUser(t, { role: 'company_member', displayName: 'Recruiter B' });
  // companyB needs a membership so its role-gated calls reach the authz layer, not just 403-on-no-company.
  await createCompanyAndJob(t, companyB);

  ({ jobId: jobA } = await createCompanyAndJob(t, companyA));
  // A private draft job under company A.
  ({ jobId: draftJobId } = await createCompanyAndJob(t, companyA, {
    title: 'Secret Staff Engineer',
    status: 'draft',
    visibility: 'private',
  }));

  // Seeker applies to A's open job → links seeker <-> company A (for resume-access checks).
  const apply = await t.app.inject({
    method: 'POST',
    url: '/api/applications',
    headers: seeker.headers,
    payload: { jobId: jobA, coverNote: 'Keen' },
  });
  if (apply.statusCode !== 201) throw new Error(`apply failed: ${apply.body}`);

  const resumes = await get('/api/candidates/me/resumes', seeker);
  resumeId = resumes.json()[0].id;

  // A conversation between company A and the seeker (strangers are not members).
  const conv = await t.app.inject({
    method: 'POST',
    url: '/api/conversations',
    headers: companyA.headers,
    payload: { participantUserId: seeker.user.id, subject: 'Chat', initialMessage: 'Hi' },
  });
  conversationId = conv.json().id;
});

afterAll(async () => {
  await t.close();
});

describe('authentication required (401)', () => {
  it('rejects unauthenticated access to protected routes', async () => {
    for (const url of ['/api/auth/me', '/api/candidates/me', '/api/conversations']) {
      const res = await get(url);
      expect(res.statusCode, `${url} should be 401`).toBe(401);
    }
  });
});

describe('role authorization (403)', () => {
  it('forbids a job_seeker from company-only routes', async () => {
    const talent = await get('/api/talent', seeker);
    expect(talent.statusCode).toBe(403);

    const createCompany = await t.app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: seeker.headers,
      payload: { name: 'Seeker Co', industry: 'Tech', size: '1-10', location: 'Tokyo' },
    });
    expect(createCompany.statusCode).toBe(403);
  });
});

describe('private/draft job confidentiality (IDOR-safe)', () => {
  it('omits a private draft job from the public list', async () => {
    const ids = (url: string, u?: TestUser) =>
      get(url, u).then((r) => (r.json().items as { id: string }[]).map((j) => j.id));
    // The owning company A only sees its draft job via the company console, not the public browse.
    expect(await ids('/api/jobs', companyA)).not.toContain(draftJobId);
    expect(await ids('/api/jobs', companyB)).not.toContain(draftJobId);
    expect(await ids('/api/jobs')).not.toContain(draftJobId); // anon
  });

  it("returns 404 for another party's draft job detail", async () => {
    const asCompanyB = await get(`/api/jobs/${draftJobId}`, companyB);
    expect(asCompanyB.statusCode).toBe(404);

    const asSeeker = await get(`/api/jobs/${draftJobId}`, seeker);
    expect(asSeeker.statusCode).toBe(404);

    // The owning company A can still see it.
    const asOwner = await get(`/api/jobs/${draftJobId}`, companyA);
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.json().id).toBe(draftJobId);
  });
});

describe('cross-tenant application + resume access', () => {
  it("hides company A's applications from company B", async () => {
    const res = await get(`/api/jobs/${jobA}/applications`, companyB);
    if (res.statusCode === 200) {
      expect(res.json()).toEqual([]); // RLS: B sees no rows for A's job
    } else {
      expect([403, 404]).toContain(res.statusCode);
    }
  });

  it('forbids an unrelated company from downloading the resume (403)', async () => {
    const res = await get(`/api/resumes/${resumeId}/download`, companyB);
    expect(res.statusCode).toBe(403);
  });

  it('forbids a random seeker from downloading the resume (403)', async () => {
    const res = await get(`/api/resumes/${resumeId}/download`, strangerSeeker);
    expect(res.statusCode).toBe(403);
  });
});

describe('conversation membership', () => {
  it('forbids a non-member from posting to a conversation', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: strangerSeeker.headers,
      payload: { body: 'let me in' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });
});
