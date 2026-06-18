import { PROFICIENCY_WEIGHT, type ProficiencyLevel, type WorkStyle } from './enums.js';
import type { MatchBreakdown } from './schemas/match.js';

/**
 * Versioned, deterministic matching algorithm (FR-05.2/05.3).
 *
 * Pipeline: vector recall (done in SQL via pgvector) produces `vectorSimilarity`;
 * this pure function then computes explainable rule-based sub-scores and combines them
 * with fixed weights into a normalized 0–100 integer. Identical input → identical output.
 * An LLM may re-order / explain the top-K afterwards but never replaces this score.
 */
export const ALGORITHM_VERSION = 'match-v1';

export const SCORING_WEIGHTS = {
  vector: 0.3,
  skill: 0.35,
  experience: 0.15,
  salary: 0.08,
  location: 0.07,
  language: 0.05,
} as const;

export interface ScoringSkill {
  name: string;
  proficiency: ProficiencyLevel;
  yearsExperience: number;
}

export interface ScoringCandidate {
  yearsExperience: number;
  skills: ScoringSkill[];
  languages: string[];
  location: string | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
}

export interface ScoringJob {
  requiredSkills: string[];
  preferredSkills: string[];
  minYears: number;
  maxYears: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  workStyle: WorkStyle;
  languages: string[];
}

export interface ScoringResult {
  score: number;
  breakdown: MatchBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
}

export function normalizeSkill(s: string): string {
  return s.trim().toLowerCase();
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Cosine similarity for in-memory fallback + tests (SQL path uses pgvector `<=>`). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface SkillScore {
  score: number;
  matched: string[];
  missing: string[];
}

function scoreSkills(candidate: ScoringCandidate, job: ScoringJob): SkillScore {
  const candByName = new Map<string, ScoringSkill>();
  for (const s of candidate.skills) candByName.set(normalizeSkill(s.name), s);

  const required = job.requiredSkills.map(normalizeSkill).filter(Boolean);
  const preferred = job.preferredSkills.map(normalizeSkill).filter(Boolean);

  const matched: string[] = [];
  const missing: string[] = [];

  const coverage = (skills: string[]): number => {
    if (skills.length === 0) return -1; // sentinel: "no constraint"
    let acc = 0;
    for (const name of skills) {
      const hit = candByName.get(name);
      if (hit) {
        acc += PROFICIENCY_WEIGHT[hit.proficiency];
      }
    }
    return acc / skills.length;
  };

  for (const name of required) (candByName.has(name) ? matched : missing).push(name);
  for (const name of preferred) {
    if (candByName.has(name) && !matched.includes(name)) matched.push(name);
  }

  const reqCov = coverage(required);
  const prefCov = coverage(preferred);

  let score: number;
  if (reqCov < 0 && prefCov < 0) {
    score = 0.6; // job lists no skills — neutral, slightly positive
  } else if (reqCov < 0) {
    score = prefCov;
  } else if (prefCov < 0) {
    score = reqCov;
  } else {
    score = 0.75 * reqCov + 0.25 * prefCov;
  }

  return { score: clamp01(score), matched, missing };
}

function scoreExperience(candidate: ScoringCandidate, job: ScoringJob): number {
  const years = candidate.yearsExperience;
  const { minYears, maxYears } = job;
  if (years >= minYears) {
    if (maxYears == null || years <= maxYears) return 1;
    const over = years - maxYears;
    return clamp01(1 - Math.min(0.4, over * 0.05));
  }
  if (minYears <= 0) return 1;
  return clamp01(years / minYears);
}

function scoreSalary(candidate: ScoringCandidate, job: ScoringJob): number {
  const jobCeiling = job.salaryMax ?? job.salaryMin;
  const want = candidate.desiredSalaryMin;
  if (jobCeiling == null || want == null || jobCeiling <= 0) return 0.7; // unknown → neutral
  if (want <= jobCeiling) return 1;
  const gap = (want - jobCeiling) / jobCeiling;
  return clamp01(1 - gap);
}

function scoreLocation(candidate: ScoringCandidate, job: ScoringJob): number {
  if (job.workStyle === 'remote') return 1;
  const c = candidate.location?.trim().toLowerCase();
  const j = job.location?.trim().toLowerCase();
  if (!c || !j) return 0.6; // unknown → neutral
  if (c === j || c.includes(j) || j.includes(c)) return 1;
  return job.workStyle === 'hybrid' ? 0.5 : 0.35;
}

function scoreLanguage(candidate: ScoringCandidate, job: ScoringJob): number {
  const req = job.languages.map(normalizeSkill).filter(Boolean);
  if (req.length === 0) return 1; // no constraint
  const have = new Set(candidate.languages.map(normalizeSkill));
  if (have.size === 0) return 0.5; // required but unverified
  let hit = 0;
  for (const l of req) if (have.has(l)) hit += 1;
  return clamp01(hit / req.length);
}

/**
 * Combine vector similarity with rule-based sub-scores into a normalized 0–100 fit score.
 * @param vectorSimilarity cosine similarity in [-1, 1] (clamped to [0, 1]).
 */
export function scoreMatch(
  vectorSimilarity: number,
  candidate: ScoringCandidate,
  job: ScoringJob,
): ScoringResult {
  const vec = clamp01(vectorSimilarity);
  const skill = scoreSkills(candidate, job);
  const experience = scoreExperience(candidate, job);
  const salary = scoreSalary(candidate, job);
  const location = scoreLocation(candidate, job);
  const language = scoreLanguage(candidate, job);

  const breakdown: MatchBreakdown = {
    vectorSimilarity: vec,
    skillScore: skill.score,
    experienceScore: experience,
    salaryScore: salary,
    locationScore: location,
    languageScore: language,
  };

  const weighted =
    SCORING_WEIGHTS.vector * vec +
    SCORING_WEIGHTS.skill * skill.score +
    SCORING_WEIGHTS.experience * experience +
    SCORING_WEIGHTS.salary * salary +
    SCORING_WEIGHTS.location * location +
    SCORING_WEIGHTS.language * language;

  const score = Math.max(0, Math.min(100, Math.round(weighted * 100)));

  return { score, breakdown, matchedSkills: skill.matched, missingSkills: skill.missing };
}

/** Human-readable reason string (locale-agnostic skeleton; UI localizes labels). */
export function buildMatchReason(result: ScoringResult): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const parts = [
    `skills ${pct(result.breakdown.skillScore)}`,
    `experience ${pct(result.breakdown.experienceScore)}`,
    `similarity ${pct(result.breakdown.vectorSimilarity)}`,
  ];
  if (result.matchedSkills.length > 0) {
    parts.push(`matched: ${result.matchedSkills.slice(0, 5).join(', ')}`);
  }
  if (result.missingSkills.length > 0) {
    parts.push(`gaps: ${result.missingSkills.slice(0, 5).join(', ')}`);
  }
  return parts.join(' · ');
}
