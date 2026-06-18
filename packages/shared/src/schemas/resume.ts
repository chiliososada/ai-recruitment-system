import { z } from 'zod';
import { ParseStatusSchema, ScanResultSchema } from '../enums.js';

/** FR-02.2: single file max 10MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** FR-02.2: PDF + DOCX only. */
export const ALLOWED_RESUME_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const ALLOWED_RESUME_EXT = ['.pdf', '.docx'] as const;

export type UploadValidationError =
  | 'resume.upload.empty'
  | 'resume.upload.tooLarge'
  | 'resume.upload.badExtension'
  | 'resume.upload.badMime';

export interface UploadCandidate {
  filename: string;
  mime: string;
  sizeBytes: number;
}

/**
 * Shared client + server upload validation (FR-02.3). Returns the i18n key of the
 * first failure or null when acceptable. Checks empty, size, extension and MIME.
 */
export function validateUpload(file: UploadCandidate): UploadValidationError | null {
  if (file.sizeBytes <= 0) return 'resume.upload.empty';
  if (file.sizeBytes > MAX_UPLOAD_BYTES) return 'resume.upload.tooLarge';
  const lower = file.filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (!ALLOWED_RESUME_EXT.includes(ext as (typeof ALLOWED_RESUME_EXT)[number])) {
    return 'resume.upload.badExtension';
  }
  if (!ALLOWED_RESUME_MIME.includes(file.mime as (typeof ALLOWED_RESUME_MIME)[number])) {
    return 'resume.upload.badMime';
  }
  return null;
}

/**
 * Sanitize an untrusted uploaded filename for safe display/storage (FR-02.3 malicious
 * filenames). Strips path components and control chars; never used to build the storage
 * path (that is a server-generated unguessable UUID).
 */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '');
  const noControl = Array.from(base)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  const cleaned = noControl.replace(/[<>:"|?*]/g, '_').trim();
  const safe = cleaned.replace(/^\.+/, '').slice(0, 200);
  return safe.length > 0 ? safe : 'resume';
}

export const ResumeFileSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  scanResult: ScanResultSchema,
  createdAt: z.string(),
});
export type ResumeFile = z.infer<typeof ResumeFileSchema>;

export const ParseJobSchema = z.object({
  id: z.string().uuid(),
  resumeFileId: z.string().uuid(),
  candidateId: z.string().uuid(),
  status: ParseStatusSchema,
  attempts: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ParseJob = z.infer<typeof ParseJobSchema>;

/** Combined response after an upload: the stored file + its kicked-off parse job. */
export const UploadResultSchema = z.object({
  resume: ResumeFileSchema,
  parseJob: ParseJobSchema,
});
export type UploadResult = z.infer<typeof UploadResultSchema>;
