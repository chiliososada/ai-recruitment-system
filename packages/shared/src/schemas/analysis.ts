import { z } from 'zod';
import { LocaleSchema, ProficiencyLevelSchema } from '../enums.js';

/**
 * Structured AI skill-analysis output (FR-03.1, FR-03.2). The LLM MUST return JSON
 * matching this schema; the API validates it and retries/falls back on mismatch.
 * Bounded sizes also limit the blast radius of prompt-injected resume content.
 */
export const AnalyzedSkillSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.string().max(60).nullable().default(null),
  proficiency: ProficiencyLevelSchema,
  yearsExperience: z.number().min(0).max(60),
  evidence: z.array(z.string().max(400)).max(8).default([]),
});
export type AnalyzedSkill = z.infer<typeof AnalyzedSkillSchema>;

export const CareerDirectionSchema = z.object({
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(600),
});
export type CareerDirection = z.infer<typeof CareerDirectionSchema>;

export const LearningAreaSchema = z.object({
  area: z.string().min(1).max(120),
  reason: z.string().min(1).max(600),
});
export type LearningArea = z.infer<typeof LearningAreaSchema>;

/** The raw, validated model output. */
export const SkillAnalysisResultSchema = z.object({
  summary: z.string().min(1).max(2000),
  totalYearsExperience: z.number().min(0).max(60),
  skills: z.array(AnalyzedSkillSchema).min(1).max(60),
  strengths: z.array(z.string().max(200)).max(12).default([]),
  careerDirections: z.array(CareerDirectionSchema).max(8).default([]),
  recommendedLearning: z.array(LearningAreaSchema).max(12).default([]),
  locale: LocaleSchema,
});
export type SkillAnalysisResult = z.infer<typeof SkillAnalysisResultSchema>;

/** Persisted analysis DTO with traceable metadata (FR-03.5). */
export const SkillAnalysisSchema = SkillAnalysisResultSchema.extend({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  modelProvider: z.string(),
  modelVersion: z.string(),
  promptVersion: z.string(),
  generatedAt: z.string(),
});
export type SkillAnalysis = z.infer<typeof SkillAnalysisSchema>;

/** Request to (re)generate analysis in a specific locale (FR-03.4). */
export const GenerateAnalysisSchema = z.object({
  locale: LocaleSchema.optional(),
});
export type GenerateAnalysisInput = z.infer<typeof GenerateAnalysisSchema>;
