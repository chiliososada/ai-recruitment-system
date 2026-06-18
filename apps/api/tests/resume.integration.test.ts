import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '@ars/shared';
import {
  createTestApp,
  createUser,
  uploadResumeFile,
  type TestApp,
  type TestUser,
} from '../src/testing/harness.js';
import {
  SAMPLE_RESUME_TEXT,
  eicarFile,
  makeResumeDocx,
  makeResumePdf,
} from '../src/testing/fixtures.js';

let t: TestApp;
let seeker: TestUser;

beforeAll(async () => {
  t = await createTestApp();
  seeker = await createUser(t, { role: 'job_seeker', locale: 'ja' });
});
afterAll(async () => {
  await t.close();
});

describe('resume upload + parse + analysis (FR-02, FR-03)', () => {
  it('uploads a valid PDF, parses it, and produces a schema-valid analysis', async () => {
    const pdf = await makeResumePdf(SAMPLE_RESUME_TEXT);
    const res = await uploadResumeFile(t, seeker.headers, {
      filename: 'cv.pdf',
      mime: 'application/pdf',
      buffer: pdf,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.resume.scanResult).toBe('clean');
    expect(body.parseJob.status).toBe('succeeded');

    const analysis = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/analysis',
      headers: seeker.headers,
    });
    expect(analysis.statusCode).toBe(200);
    const a = analysis.json();
    expect(a.locale).toBe('ja');
    expect(a.skills.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(['TypeScript', 'React']),
    );
    expect(a.careerDirections.length).toBeGreaterThan(0);
    // FR-03.4: output follows the candidate locale (Japanese summary contains 年).
    expect(a.summary).toMatch(/年/);

    const profile = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me',
      headers: seeker.headers,
    });
    const p = profile.json();
    expect(p.hasResume).toBe(true);
    expect(p.hasAnalysis).toBe(true);
    expect(p.topSkills.length).toBeGreaterThan(0);
    expect(p.yearsExperience).toBe(7);
  });

  it('accepts DOCX too', async () => {
    const docx = await makeResumeDocx(SAMPLE_RESUME_TEXT);
    const res = await uploadResumeFile(t, seeker.headers, {
      filename: 'cv.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docx,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().parseJob.status).toBe('succeeded');
  });

  it('lets the owner download their resume', async () => {
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/candidates/me/resumes',
      headers: seeker.headers,
    });
    const resumeId = list.json()[0].id;
    const dl = await t.app.inject({
      method: 'GET',
      url: `/api/resumes/${resumeId}/download`,
      headers: seeker.headers,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(0);
  });

  it('regenerates analysis in a different locale on demand (FR-03.4)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/candidates/me/analysis',
      headers: seeker.headers,
      payload: { locale: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().locale).toBe('en');
    expect(res.json().summary).toMatch(/years/i);
  });
});

describe('upload boundaries (FR-02.3, file-boundary tests)', () => {
  it('rejects a disallowed extension with 415', async () => {
    const res = await uploadResumeFile(t, seeker.headers, {
      filename: 'malware.exe',
      mime: 'application/x-msdownload',
      buffer: Buffer.from('MZ binary'),
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.messageKey).toBe('resume.upload.badExtension');
  });

  it('rejects an empty file with 400', async () => {
    const res = await uploadResumeFile(t, seeker.headers, {
      filename: 'empty.pdf',
      mime: 'application/pdf',
      buffer: Buffer.alloc(0),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.messageKey).toBe('resume.upload.empty');
  });

  it('rejects an infected file (EICAR) with 422', async () => {
    const res = await uploadResumeFile(t, seeker.headers, {
      filename: 'virus.pdf',
      mime: 'application/pdf',
      buffer: eicarFile(),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VIRUS_DETECTED');
  });

  it('rejects a file over 10MB with 413', async () => {
    const res = await uploadResumeFile(t, seeker.headers, {
      filename: 'big.pdf',
      mime: 'application/pdf',
      buffer: Buffer.alloc(MAX_UPLOAD_BYTES + 2048, 1),
    });
    expect(res.statusCode).toBe(413);
  });
});
