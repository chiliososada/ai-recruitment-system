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
let jobId: string;
let candidateId: string;

beforeAll(async () => {
  t = await createTestApp();
  seeker = await createUser(t, { role: 'job_seeker', displayName: 'Aoi Tanaka' });
  await uploadSampleResume(t, seeker);
  company = await createUser(t, { role: 'company_member' });
  ({ jobId } = await createCompanyAndJob(t, company));
  const me = await t.app.inject({ method: 'GET', url: '/api/candidates/me', headers: seeker.headers });
  candidateId = me.json().id;
});
afterAll(async () => {
  await t.close();
});

describe('talent search + detail (FR-06)', () => {
  it('lets a company search open candidates with DB-side filters', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/talent', headers: company.headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((c: { id: string }) => c.id === candidateId)).toBe(true);

    const ts = await t.app.inject({ method: 'GET', url: '/api/talent?skills=typescript', headers: company.headers });
    expect(ts.json().items.some((c: { id: string }) => c.id === candidateId)).toBe(true);

    const none = await t.app.inject({ method: 'GET', url: '/api/talent?skills=cobol', headers: company.headers });
    expect(none.json().items.some((c: { id: string }) => c.id === candidateId)).toBe(false);

    const exp = await t.app.inject({ method: 'GET', url: '/api/talent?minYears=20', headers: company.headers });
    expect(exp.json().items.some((c: { id: string }) => c.id === candidateId)).toBe(false);
  });

  it('highlights AI-recommended candidates for a specific job (FR-06.2)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/talent?recommendedForJobId=${jobId}`,
      headers: company.headers,
    });
    expect(res.statusCode).toBe(200);
    const found = res.json().items.find((c: { id: string }) => c.id === candidateId);
    expect(found.recommended).toBe(true);
    expect(found.matchScore).toBeGreaterThan(0);
  });

  it('gates sensitive fields on candidate detail until the company is linked (FR-06.3)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/talent/${candidateId}`,
      headers: company.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skills.length).toBeGreaterThan(0);
    // Not yet linked via application/shortlist → no contact email or resume link.
    expect(body.contactEmail).toBeNull();
    expect(body.resumeDownloadUrl).toBeNull();
  });

  it('forbids seekers from searching talent (403)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/talent', headers: seeker.headers });
    expect(res.statusCode).toBe(403);
  });

  it('forbids using another company\'s job for recommendations (403)', async () => {
    const otherCompany = await createUser(t, { role: 'company_member' });
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/talent?recommendedForJobId=${jobId}`,
      headers: otherCompany.headers,
    });
    expect(res.statusCode).toBe(403);
  });
});
