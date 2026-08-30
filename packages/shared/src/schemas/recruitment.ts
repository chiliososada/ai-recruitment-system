import { z } from 'zod';
import { InterviewModeSchema, InterviewStatusSchema, RecruitmentStageSchema } from '../enums.js';
import { CandidateSkillSchema } from './profile.js';

export const ApplicationSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
  stage: RecruitmentStageSchema,
  coverNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Optional join fields:
  jobTitle: z.string().optional(),
  companyId: z.string().uuid().optional(),
  companyName: z.string().optional(),
  candidateName: z.string().optional(),
  matchScore: z.number().int().nullable().optional(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const CreateApplicationSchema = z.object({
  jobId: z.string().uuid(),
  coverNote: z.string().trim().max(2000).optional(),
});
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;

export const UpdateApplicationStageSchema = z.object({
  stage: RecruitmentStageSchema,
  note: z.string().trim().max(1000).optional(),
});
export type UpdateApplicationStageInput = z.infer<typeof UpdateApplicationStageSchema>;

export const StageHistorySchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  fromStage: RecruitmentStageSchema.nullable(),
  toStage: RecruitmentStageSchema,
  changedByUserId: z.string().uuid(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type StageHistory = z.infer<typeof StageHistorySchema>;

export const ShortlistEntrySchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  candidateId: z.string().uuid(),
  jobId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  candidateName: z.string().optional(),
  candidateHeadline: z.string().nullable().optional(),
});
export type ShortlistEntry = z.infer<typeof ShortlistEntrySchema>;

export const AddShortlistSchema = z.object({
  candidateId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});
export type AddShortlistInput = z.infer<typeof AddShortlistSchema>;

/** FR-10.1: compare 2–5 candidates side by side. */
export const CompareRequestSchema = z.object({
  candidateIds: z
    .array(z.string().uuid())
    .min(2)
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'candidateIds must be distinct',
    }),
  jobId: z.string().uuid().optional(),
});
export type CompareRequestInput = z.infer<typeof CompareRequestSchema>;

export const ComparisonCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  displayName: z.string(),
  headline: z.string().nullable(),
  yearsExperience: z.number(),
  matchScore: z.number().int().nullable(),
  summary: z.string().nullable(),
  skills: z.array(CandidateSkillSchema),
  keyEvidence: z.array(z.string()),
});
export type ComparisonCandidate = z.infer<typeof ComparisonCandidateSchema>;

export const ComparisonResultSchema = z.object({
  jobId: z.string().uuid().nullable(),
  candidates: z.array(ComparisonCandidateSchema),
});
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

export const InterviewSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  proposedByUserId: z.string().uuid(),
  scheduledAt: z.string(),
  durationMinutes: z.number().int(),
  mode: InterviewModeSchema,
  location: z.string().nullable(),
  notes: z.string().nullable(),
  status: InterviewStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Interview = z.infer<typeof InterviewSchema>;

export const ProposeInterviewSchema = z.object({
  scheduledAt: z.string().datetime({ message: 'interview.time.invalid' }),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  mode: InterviewModeSchema,
  location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ProposeInterviewInput = z.infer<typeof ProposeInterviewSchema>;

export const RespondInterviewSchema = z.object({
  response: z.enum(['confirmed', 'declined']),
});
export type RespondInterviewInput = z.infer<typeof RespondInterviewSchema>;
