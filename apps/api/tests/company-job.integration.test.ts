import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createUser, type TestApp, type TestUser } from '../src/testing/harness.js';

let t: TestApp;
let companyA: TestUser;
let companyB: TestUser;
let seeker: TestUser;
let companyAId: string;
let jobId: string;

const post = (url: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url, headers, payload });

beforeAll(async () => {
  t = await createTestApp();
  companyA = await createUser(t, { role: 'company_member' });
  companyB = await createUser(t, { role: 'company_member' });
  seeker = await createUser(t, { role: 'job_seeker' });

  const comp = await post('/api/companies', companyA.headers, {
    name: 'Acme Robotics',
    industry: 'Manufacturing',
    size: '51-200',
    location: 'Tokyo',
  });
  companyAId = comp.json().id;
  await post('/api/companies', companyB.headers, { name: 'Globex', industry: 'Finance' });
});
afterAll(async () => {
  await t.close();
});

describe('company + job management (FR-04)', () => {
  it('creates a company and rejects seekers creating companies (403)', async () => {
    const res = await post('/api/companies', seeker.headers, { name: 'Hacky Inc' });
    expect(res.statusCode).toBe(403);
  });

  it('creates a draft job with skills', async () => {
    const res = await post(`/api/companies/${companyAId}/jobs`, companyA.headers, {
      title: 'Senior Backend Engineer',
      category: 'Engineering',
      description: 'Build scalable Node.js services backed by PostgreSQL.',
      requiredSkills: ['TypeScript', 'Node.js'],
      preferredSkills: ['PostgreSQL'],
      minYears: 3,
      salaryMin: 6000000,
      salaryMax: 9000000,
      workStyle: 'hybrid',
      status: 'draft',
      visibility: 'private',
    });
    expect(res.statusCode).toBe(201);
    const job = res.json();
    jobId = job.id;
    expect(job.requiredSkills).toEqual(expect.arrayContaining(['TypeScript', 'Node.js']));
    expect(job.status).toBe('draft');
  });

  it('rejects a job with an inverted salary range (422)', async () => {
    const res = await post(`/api/companies/${companyAId}/jobs`, companyA.headers, {
      title: 'Bad Job',
      category: 'Eng',
      description: 'A description long enough to pass.',
      salaryMin: 9000000,
      salaryMax: 5000000,
    });
    expect(res.statusCode).toBe(422);
  });

  it('hides draft/private jobs from the public list (FR-04.3)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/jobs' });
    const ids = res.json().items.map((j: { id: string }) => j.id);
    expect(ids).not.toContain(jobId);
  });

  it('publishes the job and it appears publicly', async () => {
    const upd = await t.app.inject({
      method: 'PATCH',
      url: `/api/jobs/${jobId}`,
      headers: companyA.headers,
      payload: { status: 'open', visibility: 'public' },
    });
    expect(upd.statusCode).toBe(200);
    const res = await t.app.inject({ method: 'GET', url: '/api/jobs?q=Backend' });
    const ids = res.json().items.map((j: { id: string }) => j.id);
    expect(ids).toContain(jobId);
  });

  it('filters public jobs by skill (DB-side)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/jobs?skills=typescript' });
    expect(res.json().items.length).toBeGreaterThan(0);
    const none = await t.app.inject({ method: 'GET', url: '/api/jobs?skills=cobol' });
    expect(none.json().items.length).toBe(0);
  });

  it('prevents another company from editing the job (cross-tenant 403)', async () => {
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/jobs/${jobId}`,
      headers: companyB.headers,
      payload: { title: 'Hijacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lists companies with filters + pagination', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/companies?industry=Manufacturing' });
    const body = res.json();
    expect(body.items.some((c: { id: string }) => c.id === companyAId)).toBe(true);
    expect(body.items.every((c: { industry: string }) => c.industry === 'Manufacturing')).toBe(
      true,
    );
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('shows only public jobs on a company detail jobs list', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/companies/${companyAId}/jobs` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.every((j: { status: string }) => j.status === 'open')).toBe(true);
  });

  it('lets a member see all jobs incl. drafts via the console endpoint', async () => {
    const draft = await post(`/api/companies/${companyAId}/jobs`, companyA.headers, {
      title: 'Hidden Draft',
      category: 'Eng',
      description: 'Internal draft description here.',
    });
    expect(draft.statusCode).toBe(201);
    const manage = await t.app.inject({
      method: 'GET',
      url: `/api/companies/${companyAId}/manage/jobs`,
      headers: companyA.headers,
    });
    const titles = manage.json().map((j: { title: string }) => j.title);
    expect(titles).toContain('Hidden Draft');
  });
});
