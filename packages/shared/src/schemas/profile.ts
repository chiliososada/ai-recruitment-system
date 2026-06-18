import { z } from 'zod';
import { CurrencySchema, LocaleSchema, ProficiencyLevelSchema } from '../enums.js';
import { boundedText, optionalText } from './common.js';

/** A skill attached to a candidate (derived from AI analysis or self-reported). */
export const CandidateSkillSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
  proficiency: ProficiencyLevelSchema,
  yearsExperience: z.number().min(0).max(60),
  evidence: z.array(z.string()).default([]),
});
export type CandidateSkill = z.infer<typeof CandidateSkillSchema>;

/** Candidate-facing profile DTO. Sensitive fields (raw resume, email) are NOT here. */
export const CandidateProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  location: z.string().nullable(),
  yearsExperience: z.number().min(0).max(60),
  openToWork: z.boolean(),
  desiredSalaryMin: z.number().int().nullable(),
  desiredSalaryMax: z.number().int().nullable(),
  currency: CurrencySchema.nullable(),
  locale: LocaleSchema,
  languages: z.array(z.string()),
  topSkills: z.array(z.string()),
  hasResume: z.boolean(),
  hasAnalysis: z.boolean(),
  updatedAt: z.string(),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const UpdateCandidateProfileSchema = z
  .object({
    headline: optionalText(160),
    summary: optionalText(4000),
    location: optionalText(160),
    yearsExperience: z.number().min(0).max(60).optional(),
    openToWork: z.boolean().optional(),
    languages: z.array(boundedText(2, 40)).max(10).optional(),
    desiredSalaryMin: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    desiredSalaryMax: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    currency: CurrencySchema.optional(),
  })
  .refine(
    (v) =>
      v.desiredSalaryMin == null ||
      v.desiredSalaryMax == null ||
      v.desiredSalaryMax >= v.desiredSalaryMin,
    { message: 'profile.salary.rangeInvalid', path: ['desiredSalaryMax'] },
  );
export type UpdateCandidateProfileInput = z.infer<typeof UpdateCandidateProfileSchema>;

/** Detailed candidate view returned to authorized company members (FR-06.3). */
export const CandidateDetailSchema = CandidateProfileSchema.extend({
  skills: z.array(CandidateSkillSchema),
  /** Only present when the viewer is authorized to download the resume. */
  resumeDownloadUrl: z.string().nullable(),
  /** Contact email only revealed to companies the candidate has engaged with. */
  contactEmail: z.string().nullable(),
});
export type CandidateDetail = z.infer<typeof CandidateDetailSchema>;

export const TalentSearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
  sort: z.enum(['recent', 'experience', 'name']).default('recent'),
  q: optionalText(160),
  minYears: z.coerce.number().min(0).max(60).optional(),
  skills: optionalText(400),
  location: optionalText(160),
  /** Restrict to candidates AI-recommended for this job (FR-06.2). */
  recommendedForJobId: z.string().uuid().optional(),
});
export type TalentSearchQuery = z.infer<typeof TalentSearchQuerySchema>;
