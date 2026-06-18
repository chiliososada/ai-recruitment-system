import { z } from 'zod';
import { CompanyMemberRoleSchema, CompanySizeSchema } from '../enums.js';
import { boundedText, optionalText } from './common.js';

export const CompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  industry: z.string().nullable(),
  size: CompanySizeSchema.nullable(),
  location: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Count of public+open jobs, present on list/detail responses. */
  openJobCount: z.number().int().optional(),
});
export type Company = z.infer<typeof CompanySchema>;

const websiteField = z
  .string()
  .trim()
  .url({ message: 'company.website.invalid' })
  .max(300)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const CreateCompanySchema = z.object({
  name: boundedText(2, 160),
  description: optionalText(4000),
  industry: optionalText(120),
  size: CompanySizeSchema.optional(),
  location: optionalText(160),
  websiteUrl: websiteField,
});
export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;

export const UpdateCompanySchema = CreateCompanySchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'common.noChanges' },
);
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;

export const CompanyMemberSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  role: CompanyMemberRoleSchema,
  displayName: z.string(),
  email: z.string(),
  createdAt: z.string(),
});
export type CompanyMember = z.infer<typeof CompanyMemberSchema>;

export const CompanySearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
  sort: z.enum(['recent', 'name', 'jobs']).default('recent'),
  q: optionalText(160),
  industry: optionalText(120),
  size: CompanySizeSchema.optional(),
  location: optionalText(160),
});
export type CompanySearchQuery = z.infer<typeof CompanySearchQuerySchema>;
