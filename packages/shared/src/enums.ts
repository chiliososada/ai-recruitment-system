import { z } from 'zod';

/** Supported UI + content locales. Japanese is the product default (FR-09.1). */
export const LOCALES = ['ja', 'en', 'zh-CN', 'zh-TW'] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;
export const DEFAULT_LOCALE: Locale = 'ja';

/** Top-level account role (FR-01.3). */
export const USER_ROLES = ['job_seeker', 'company_member'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Role of a member within a company. */
export const COMPANY_MEMBER_ROLES = ['owner', 'recruiter'] as const;
export const CompanyMemberRoleSchema = z.enum(COMPANY_MEMBER_ROLES);
export type CompanyMemberRole = z.infer<typeof CompanyMemberRoleSchema>;

/** Where the work happens (FR-04.2). */
export const WORK_STYLES = ['onsite', 'hybrid', 'remote'] as const;
export const WorkStyleSchema = z.enum(WORK_STYLES);
export type WorkStyle = z.infer<typeof WorkStyleSchema>;

/** Job lifecycle status; only `open` jobs appear in matching/recommendations. */
export const JOB_STATUSES = ['draft', 'open', 'closed'] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Public listings only ever expose `public` + `open` jobs (FR-04.3, FR-07.3). */
export const JOB_VISIBILITIES = ['public', 'private'] as const;
export const JobVisibilitySchema = z.enum(JOB_VISIBILITIES);
export type JobVisibility = z.infer<typeof JobVisibilitySchema>;

/** Skill proficiency buckets used by AI analysis + matching (FR-03.1). */
export const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export const ProficiencyLevelSchema = z.enum(PROFICIENCY_LEVELS);
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;

/** Numeric weight for a proficiency level, used by the scoring core. */
export const PROFICIENCY_WEIGHT: Record<ProficiencyLevel, number> = {
  beginner: 0.4,
  intermediate: 0.65,
  advanced: 0.85,
  expert: 1,
};

/** Async resume parse / analysis job status (FR-02.5). */
export const PARSE_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
export const ParseStatusSchema = z.enum(PARSE_STATUSES);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

/** Company size buckets for FR-07.2 filtering. */
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;
export const CompanySizeSchema = z.enum(COMPANY_SIZES);
export type CompanySize = z.infer<typeof CompanySizeSchema>;

/** Recruitment pipeline stage (FR-10.3). Stored on applications + audited in history. */
export const RECRUITMENT_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export const RecruitmentStageSchema = z.enum(RECRUITMENT_STAGES);
export type RecruitmentStage = z.infer<typeof RecruitmentStageSchema>;

/** Allowed stage transitions (server-enforced). `withdrawn` is seeker-initiated. */
export const STAGE_TRANSITIONS: Record<RecruitmentStage, RecruitmentStage[]> = {
  applied: ['screening', 'interview', 'rejected', 'withdrawn'],
  screening: ['interview', 'offer', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['hired', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

/** Interview delivery mode (FR-10.4). */
export const INTERVIEW_MODES = ['onsite', 'online', 'phone'] as const;
export const InterviewModeSchema = z.enum(INTERVIEW_MODES);
export type InterviewMode = z.infer<typeof InterviewModeSchema>;

/** Interview proposal lifecycle (FR-10.4). */
export const INTERVIEW_STATUSES = [
  'proposed',
  'confirmed',
  'declined',
  'cancelled',
  'completed',
] as const;
export const InterviewStatusSchema = z.enum(INTERVIEW_STATUSES);
export type InterviewStatus = z.infer<typeof InterviewStatusSchema>;

/** In-app notification categories (FR-08.2, FR-10.4). */
export const NOTIFICATION_TYPES = [
  'message',
  'application_received',
  'application_status_changed',
  'interview_proposed',
  'interview_updated',
  'match_ready',
  'system',
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/** Currency for salary ranges. */
export const CURRENCIES = ['JPY', 'USD', 'CNY', 'TWD', 'EUR'] as const;
export const CurrencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof CurrencySchema>;

/** Virus scan verdict (FR-02.4). */
export const SCAN_RESULTS = ['clean', 'infected', 'error'] as const;
export const ScanResultSchema = z.enum(SCAN_RESULTS);
export type ScanResult = z.infer<typeof ScanResultSchema>;
