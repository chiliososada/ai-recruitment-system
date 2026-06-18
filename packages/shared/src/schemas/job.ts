import { z } from 'zod';
import { CurrencySchema, JobStatusSchema, JobVisibilitySchema, WorkStyleSchema } from '../enums.js';
import { boundedText, optionalText } from './common.js';

const skillList = z
  .array(boundedText(1, 60))
  .max(40)
  .default([])
  .transform((arr) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean))));

const languageList = z.array(boundedText(2, 40)).max(10).default([]);

export const JobSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  companyName: z.string().optional(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  minYears: z.number().int().min(0).max(60),
  maxYears: z.number().int().min(0).max(60).nullable(),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  currency: CurrencySchema,
  location: z.string().nullable(),
  workStyle: WorkStyleSchema,
  languages: z.array(z.string()),
  status: JobStatusSchema,
  visibility: JobVisibilitySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

export const CreateJobSchema = z
  .object({
    title: boundedText(2, 160),
    category: boundedText(2, 80),
    description: boundedText(10, 8000),
    requiredSkills: skillList,
    preferredSkills: skillList,
    minYears: z.number().int().min(0).max(60).default(0),
    maxYears: z.number().int().min(0).max(60).nullable().default(null),
    salaryMin: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
    salaryMax: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
    currency: CurrencySchema.default('JPY'),
    location: optionalText(160),
    workStyle: WorkStyleSchema.default('onsite'),
    languages: languageList,
    status: JobStatusSchema.default('draft'),
    visibility: JobVisibilitySchema.default('private'),
  })
  .refine((v) => v.maxYears == null || v.maxYears >= v.minYears, {
    message: 'job.years.rangeInvalid',
    path: ['maxYears'],
  })
  .refine((v) => v.salaryMin == null || v.salaryMax == null || v.salaryMax >= v.salaryMin, {
    message: 'job.salary.rangeInvalid',
    path: ['salaryMax'],
  });
export type CreateJobInput = z.infer<typeof CreateJobSchema>;

/** Update accepts the same fields, all optional, with the same cross-field checks. */
export const UpdateJobSchema = z
  .object({
    title: boundedText(2, 160).optional(),
    category: boundedText(2, 80).optional(),
    description: boundedText(10, 8000).optional(),
    requiredSkills: skillList.optional(),
    preferredSkills: skillList.optional(),
    minYears: z.number().int().min(0).max(60).optional(),
    maxYears: z.number().int().min(0).max(60).nullable().optional(),
    salaryMin: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    currency: CurrencySchema.optional(),
    location: optionalText(160),
    workStyle: WorkStyleSchema.optional(),
    languages: languageList.optional(),
    status: JobStatusSchema.optional(),
    visibility: JobVisibilitySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'common.noChanges' })
  .refine((v) => v.maxYears == null || v.minYears == null || v.maxYears >= v.minYears, {
    message: 'job.years.rangeInvalid',
    path: ['maxYears'],
  })
  .refine((v) => v.salaryMin == null || v.salaryMax == null || v.salaryMax >= v.salaryMin, {
    message: 'job.salary.rangeInvalid',
    path: ['salaryMax'],
  });
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;

/** Public job browse query (FR-07). */
export const JobSearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
  sort: z.enum(['recent', 'salary', 'title']).default('recent'),
  q: optionalText(160),
  category: optionalText(80),
  workStyle: WorkStyleSchema.optional(),
  location: optionalText(160),
  salaryMin: z.coerce.number().int().min(0).optional(),
  skills: optionalText(400),
  companyId: z.string().uuid().optional(),
});
export type JobSearchQuery = z.infer<typeof JobSearchQuerySchema>;
