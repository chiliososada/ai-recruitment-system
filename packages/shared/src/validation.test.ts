import { describe, expect, it } from 'vitest';
import { RegisterSchema } from './schemas/auth.js';
import { CreateJobSchema } from './schemas/job.js';
import { MAX_UPLOAD_BYTES, sanitizeFilename, validateUpload } from './schemas/resume.js';
import { SkillAnalysisResultSchema } from './schemas/analysis.js';
import { SendMessageSchema } from './schemas/messaging.js';

describe('validateUpload (FR-02.3)', () => {
  const pdf = { filename: 'cv.pdf', mime: 'application/pdf', sizeBytes: 1024 };
  it('accepts a valid PDF', () => {
    expect(validateUpload(pdf)).toBeNull();
  });
  it('rejects empty files', () => {
    expect(validateUpload({ ...pdf, sizeBytes: 0 })).toBe('resume.upload.empty');
  });
  it('rejects files over 10MB', () => {
    expect(validateUpload({ ...pdf, sizeBytes: MAX_UPLOAD_BYTES + 1 })).toBe(
      'resume.upload.tooLarge',
    );
  });
  it('rejects disallowed extensions', () => {
    expect(validateUpload({ ...pdf, filename: 'cv.exe' })).toBe('resume.upload.badExtension');
  });
  it('rejects disallowed MIME types', () => {
    expect(validateUpload({ ...pdf, mime: 'application/x-msdownload' })).toBe(
      'resume.upload.badMime',
    );
  });
});

describe('sanitizeFilename (malicious filenames, FR-02.3)', () => {
  it('strips path traversal components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32\\evil.docx')).toBe('evil.docx');
  });
  it('removes dangerous characters and leading dots', () => {
    expect(sanitizeFilename('....pdf')).not.toMatch(/^\./);
    expect(sanitizeFilename('a<b>c:d.pdf')).toBe('a_b_c_d.pdf');
  });
  it('never returns an empty string', () => {
    expect(sanitizeFilename('')).toBe('resume');
    expect(sanitizeFilename('///')).toBe('resume');
  });
});

describe('RegisterSchema (FR-01.1)', () => {
  it('accepts a strong password and normalizes the email', () => {
    const r = RegisterSchema.parse({
      email: '  USER@Example.COM ',
      password: 'sup3rSecret',
      role: 'job_seeker',
      displayName: 'Aoi',
    });
    expect(r.email).toBe('user@example.com');
  });
  it('rejects weak passwords', () => {
    expect(RegisterSchema.safeParse({
      email: 'a@b.co',
      password: 'short',
      role: 'job_seeker',
      displayName: 'X',
    }).success).toBe(false);
    expect(RegisterSchema.safeParse({
      email: 'a@b.co',
      password: 'alllettersbutnodigits',
      role: 'job_seeker',
      displayName: 'X',
    }).success).toBe(false);
  });
  it('rejects unknown roles', () => {
    expect(
      RegisterSchema.safeParse({
        email: 'a@b.co',
        password: 'passw0rd',
        role: 'admin',
        displayName: 'X',
      }).success,
    ).toBe(false);
  });
});

describe('CreateJobSchema (FR-04.4)', () => {
  it('applies sensible defaults and dedupes skills', () => {
    const j = CreateJobSchema.parse({
      title: 'Backend Engineer',
      category: 'Engineering',
      description: 'Build APIs and services for our platform.',
      requiredSkills: ['Go', 'Go', ' SQL '],
    });
    expect(j.requiredSkills).toEqual(['Go', 'SQL']);
    expect(j.status).toBe('draft');
    expect(j.visibility).toBe('private');
    expect(j.currency).toBe('JPY');
  });
  it('rejects an inverted salary range', () => {
    const res = CreateJobSchema.safeParse({
      title: 'X Engineer',
      category: 'Eng',
      description: 'A valid length description here.',
      salaryMin: 9000000,
      salaryMax: 5000000,
    });
    expect(res.success).toBe(false);
  });
});

describe('SkillAnalysisResultSchema (FR-03.2)', () => {
  const valid = {
    summary: 'Experienced full-stack engineer.',
    totalYearsExperience: 6,
    skills: [{ name: 'TypeScript', proficiency: 'expert', yearsExperience: 6, evidence: ['Led X'] }],
    strengths: ['Leadership'],
    careerDirections: [{ title: 'Staff Engineer', rationale: 'Deep technical breadth.' }],
    recommendedLearning: [{ area: 'Distributed systems', reason: 'Scale roles.' }],
    locale: 'en',
  };
  it('accepts a well-formed analysis', () => {
    expect(SkillAnalysisResultSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects an analysis with no skills', () => {
    expect(SkillAnalysisResultSchema.safeParse({ ...valid, skills: [] }).success).toBe(false);
  });
  it('rejects invalid proficiency values (schema guards untrusted model output)', () => {
    expect(
      SkillAnalysisResultSchema.safeParse({
        ...valid,
        skills: [{ name: 'X', proficiency: 'godlike', yearsExperience: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe('SendMessageSchema (FR-08.4)', () => {
  it('trims and rejects empty bodies', () => {
    expect(SendMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
  });
  it('rejects over-long bodies', () => {
    expect(SendMessageSchema.safeParse({ body: 'a'.repeat(4001) }).success).toBe(false);
  });
});
