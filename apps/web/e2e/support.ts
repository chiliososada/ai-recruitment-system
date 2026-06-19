import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4000';
const resumePdf = readFileSync(fileURLToPath(new URL('./fixtures/resume.pdf', import.meta.url)));

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function register(
  request: APIRequestContext,
  role: 'job_seeker' | 'company_member',
  email: string,
  displayName: string,
): Promise<string> {
  const res = await request.post(`${API}/api/auth/register`, {
    data: { email, password: 'passw0rd1', role, displayName, locale: 'ja' },
  });
  if (!res.ok()) throw new Error(`register failed (${res.status()}): ${await res.text()}`);
  return (await res.json()).accessToken as string;
}

export interface SeedResult {
  seekerToken: string;
  companyToken: string;
  companyId: string;
  jobId: string;
}

/** Seed a seeker (with a parsed résumé) + a company with a public job, via the API. */
export async function seedFixtures(request: APIRequestContext): Promise<SeedResult> {
  const stamp = Date.now();
  const seekerToken = await register(
    request,
    'job_seeker',
    `seeker-${stamp}@vis.test`,
    'Aoi Tanaka',
  );
  const up = await request.post(`${API}/api/candidates/me/resume`, {
    headers: auth(seekerToken),
    multipart: { file: { name: 'resume.pdf', mimeType: 'application/pdf', buffer: resumePdf } },
  });
  if (!up.ok()) throw new Error(`resume upload failed (${up.status()}): ${await up.text()}`);

  const companyToken = await register(
    request,
    'company_member',
    `company-${stamp}@vis.test`,
    'Demo Recruiter',
  );
  const compRes = await request.post(`${API}/api/companies`, {
    headers: auth(companyToken),
    data: { name: 'Acme Robotics', industry: 'Technology', size: '51-200', location: 'Tokyo' },
  });
  const company = await compRes.json();
  const jobRes = await request.post(`${API}/api/companies/${company.id}/jobs`, {
    headers: auth(companyToken),
    data: {
      title: 'Full-Stack Engineer',
      category: 'Engineering',
      description: 'Build TypeScript, React and Node.js apps backed by PostgreSQL on AWS.',
      requiredSkills: ['TypeScript', 'React', 'Node.js'],
      preferredSkills: ['PostgreSQL', 'AWS'],
      minYears: 3,
      salaryMin: 6_000_000,
      salaryMax: 10_000_000,
      workStyle: 'hybrid',
      status: 'open',
      visibility: 'public',
    },
  });
  const job = await jobRes.json();
  return { seekerToken, companyToken, companyId: company.id, jobId: job.id };
}
