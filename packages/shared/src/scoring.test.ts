import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_VERSION,
  cosineSimilarity,
  scoreMatch,
  type ScoringCandidate,
  type ScoringJob,
} from './scoring.js';

const strongCandidate: ScoringCandidate = {
  yearsExperience: 6,
  skills: [
    { name: 'TypeScript', proficiency: 'expert', yearsExperience: 6 },
    { name: 'React', proficiency: 'advanced', yearsExperience: 5 },
    { name: 'Node.js', proficiency: 'advanced', yearsExperience: 5 },
    { name: 'PostgreSQL', proficiency: 'intermediate', yearsExperience: 3 },
  ],
  languages: ['ja', 'en'],
  location: 'Tokyo',
  desiredSalaryMin: 7000000,
  desiredSalaryMax: 9000000,
};

const demandingJob: ScoringJob = {
  requiredSkills: ['TypeScript', 'React', 'Node.js'],
  preferredSkills: ['PostgreSQL', 'AWS'],
  minYears: 4,
  maxYears: 10,
  salaryMin: 6000000,
  salaryMax: 9000000,
  location: 'Tokyo',
  workStyle: 'hybrid',
  languages: ['ja'],
};

const weakCandidate: ScoringCandidate = {
  yearsExperience: 0,
  skills: [{ name: 'Excel', proficiency: 'beginner', yearsExperience: 1 }],
  languages: [],
  location: 'Osaka',
  desiredSalaryMin: 20000000,
  desiredSalaryMax: 25000000,
};

describe('scoreMatch', () => {
  it('always returns an integer in [0, 100]', () => {
    for (const sim of [-1, 0, 0.5, 1, 2]) {
      const r = scoreMatch(sim, strongCandidate, demandingJob);
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('clamps vector similarity at the boundaries (stable boundaries, FR-05.3)', () => {
    const below = scoreMatch(-5, strongCandidate, demandingJob);
    const atZero = scoreMatch(0, strongCandidate, demandingJob);
    const above = scoreMatch(5, strongCandidate, demandingJob);
    const atOne = scoreMatch(1, strongCandidate, demandingJob);
    expect(below.score).toBe(atZero.score);
    expect(above.score).toBe(atOne.score);
    expect(below.breakdown.vectorSimilarity).toBe(0);
    expect(above.breakdown.vectorSimilarity).toBe(1);
  });

  it('scores a strong candidate well above a weak one (ordering)', () => {
    const strong = scoreMatch(0.9, strongCandidate, demandingJob);
    const weak = scoreMatch(0.9, weakCandidate, demandingJob);
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThanOrEqual(80);
    expect(weak.score).toBeLessThan(50);
  });

  it('is fully reproducible for identical inputs (FR-05.3)', () => {
    const a = scoreMatch(0.73, strongCandidate, demandingJob);
    const b = scoreMatch(0.73, structuredClone(strongCandidate), structuredClone(demandingJob));
    expect(a).toEqual(b);
  });

  it('reports matched and missing required skills', () => {
    const r = scoreMatch(0.5, strongCandidate, demandingJob);
    expect(r.matchedSkills).toEqual(expect.arrayContaining(['typescript', 'react', 'node.js']));
    expect(r.missingSkills).not.toContain('typescript');
    const weak = scoreMatch(0.5, weakCandidate, demandingJob);
    expect(weak.missingSkills).toEqual(expect.arrayContaining(['typescript', 'react', 'node.js']));
  });

  it('treats a job with no skill requirements neutrally', () => {
    const openJob: ScoringJob = { ...demandingJob, requiredSkills: [], preferredSkills: [] };
    const r = scoreMatch(0.5, weakCandidate, openJob);
    expect(r.breakdown.skillScore).toBeGreaterThan(0);
  });

  it('monotonically rewards higher vector similarity', () => {
    const low = scoreMatch(0.1, strongCandidate, demandingJob).score;
    const high = scoreMatch(0.95, strongCandidate, demandingJob).score;
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it('exposes a stable algorithm version', () => {
    expect(ALGORITHM_VERSION).toBe('match-v1');
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
  it('handles degenerate input safely', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});
