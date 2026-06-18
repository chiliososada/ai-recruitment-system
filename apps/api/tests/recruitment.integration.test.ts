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
let seeker2: TestUser;
let company: TestUser;
let companyB: TestUser;
let jobId: string;
let seekerCandidateId: string;
let seeker2CandidateId: string;
let applicationId: string;

const get = (url: string, u: TestUser) => t.app.inject({ method: 'GET', url, headers: u.headers });
const post = (url: string, u: TestUser, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url, headers: u.headers, payload });
const patch = (url: string, u: TestUser, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'PATCH', url, headers: u.headers, payload });

beforeAll(async () => {
  t = await createTestApp();
  seeker = await createUser(t, { role: 'job_seeker', displayName: 'Aoi' });
  seeker2 = await createUser(t, { role: 'job_seeker', displayName: 'Ben' });
  await uploadSampleResume(t, seeker);
  await uploadSampleResume(t, seeker2);
  company = await createUser(t, { role: 'company_member' });
  companyB = await createUser(t, { role: 'company_member' });
  await createCompanyAndJob(t, companyB); // companyB needs a membership for compare/shortlist authz
  ({ jobId } = await createCompanyAndJob(t, company));
  seekerCandidateId = (await get('/api/candidates/me', seeker)).json().id;
  seeker2CandidateId = (await get('/api/candidates/me', seeker2)).json().id;
});
afterAll(async () => {
  await t.close();
});

describe('applications + pipeline (FR-10.2/10.3)', () => {
  it('lets a seeker apply and rejects duplicates', async () => {
    const res = await post('/api/applications', seeker, { jobId, coverNote: 'Keen to join' });
    expect(res.statusCode).toBe(201);
    applicationId = res.json().id;
    expect(res.json().stage).toBe('applied');
    const dup = await post('/api/applications', seeker, { jobId });
    expect(dup.statusCode).toBe(409);
  });

  it('shows the application (with match score) only to the owning company', async () => {
    const mine = await get(`/api/jobs/${jobId}/applications`, company);
    expect(mine.json().some((a: { id: string }) => a.id === applicationId)).toBe(true);
    expect(mine.json()[0].matchScore).toBeGreaterThanOrEqual(0);
    const other = await get(`/api/jobs/${jobId}/applications`, companyB);
    expect(other.json()).toEqual([]); // RLS: not companyB's job
  });

  it('advances the stage with audit history and enforces valid transitions', async () => {
    const s1 = await patch(`/api/applications/${applicationId}/stage`, company, { stage: 'screening' });
    expect(s1.statusCode).toBe(200);
    expect(s1.json().stage).toBe('screening');
    const bad = await patch(`/api/applications/${applicationId}/stage`, company, { stage: 'hired' });
    expect(bad.statusCode).toBe(409); // screening -> hired not allowed
    const hist = await get(`/api/applications/${applicationId}/history`, company);
    expect(hist.json().map((h: { toStage: string }) => h.toStage)).toEqual(['applied', 'screening']);
  });

  it('forbids another company from changing the stage (cross-tenant IDOR)', async () => {
    const res = await patch(`/api/applications/${applicationId}/stage`, companyB, { stage: 'interview' });
    // 404 hides existence from a non-owning company (IDOR-safe); 403 also acceptable.
    expect([403, 404]).toContain(res.statusCode);
  });

  it('forbids a seeker from advancing the stage (only withdraw)', async () => {
    const res = await patch(`/api/applications/${applicationId}/stage`, seeker, { stage: 'interview' });
    expect(res.statusCode).toBe(403);
  });

  it('unlocks contact + resume on candidate detail once the company is linked (FR-06.3)', async () => {
    const detail = await get(`/api/talent/${seekerCandidateId}`, company);
    expect(detail.json().contactEmail).toBe(seeker.email);
    expect(detail.json().resumeDownloadUrl).toMatch(/\/api\/resumes\//);
  });
});

describe('shortlist + comparison (FR-10.1)', () => {
  it('shortlists a candidate and lists it', async () => {
    const res = await post('/api/shortlists', company, { candidateId: seekerCandidateId, jobId });
    expect(res.statusCode).toBe(201);
    const list = await get('/api/shortlists', company);
    expect(list.json().some((s: { candidateId: string }) => s.candidateId === seekerCandidateId)).toBe(true);
  });

  it('compares candidates side by side with skills, summary and match score', async () => {
    const res = await post('/api/compare', company, {
      candidateIds: [seekerCandidateId, seeker2CandidateId],
      jobId,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates.length).toBe(2);
    for (const c of body.candidates) {
      expect(c.skills.length).toBeGreaterThan(0);
      expect(c.summary).toBeTruthy();
      expect(c.matchScore).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('interviews (FR-10.4)', () => {
  it('lets the company propose and the seeker confirm', async () => {
    const propose = await post(`/api/applications/${applicationId}/interviews`, company, {
      scheduledAt: '2030-01-15T09:00:00.000Z',
      durationMinutes: 45,
      mode: 'online',
      notes: 'Tech interview',
    });
    expect(propose.statusCode).toBe(201);
    const interviewId = propose.json().id;
    expect(propose.json().status).toBe('proposed');

    const respond = await post(`/api/interviews/${interviewId}/respond`, seeker, { response: 'confirmed' });
    expect(respond.statusCode).toBe(200);
    expect(respond.json().status).toBe('confirmed');

    const notifs = await get('/api/notifications', seeker);
    expect(notifs.json().some((n: { type: string }) => n.type === 'interview_proposed')).toBe(true);
  });

  it('forbids another company proposing an interview on the application (negative authz)', async () => {
    const res = await post(`/api/applications/${applicationId}/interviews`, companyB, {
      scheduledAt: '2030-02-15T09:00:00.000Z',
      mode: 'phone',
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets the seeker withdraw their own application', async () => {
    const res = await patch(`/api/applications/${applicationId}/stage`, seeker, { stage: 'withdrawn' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe('withdrawn');
  });
});
