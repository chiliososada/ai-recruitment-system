import { z } from 'zod';

/** Normalized 0–1 sub-scores that compose the final 0–100 fit score (FR-05.2/05.3). */
export const MatchBreakdownSchema = z.object({
  vectorSimilarity: z.number().min(0).max(1),
  skillScore: z.number().min(0).max(1),
  experienceScore: z.number().min(0).max(1),
  salaryScore: z.number().min(0).max(1),
  locationScore: z.number().min(0).max(1),
  languageScore: z.number().min(0).max(1),
});
export type MatchBreakdown = z.infer<typeof MatchBreakdownSchema>;

export const MatchResultSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
  /** Final fit score, normalized integer 0–100. */
  score: z.number().int().min(0).max(100),
  breakdown: MatchBreakdownSchema,
  reason: z.string(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  algorithmVersion: z.string(),
  createdAt: z.string(),
  // Optional join fields for display:
  jobTitle: z.string().optional(),
  companyId: z.string().uuid().optional(),
  companyName: z.string().optional(),
  candidateName: z.string().optional(),
  candidateHeadline: z.string().nullable().optional(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
