import { z } from 'zod';
import { ParseStatusSchema, ScanResultSchema } from '../enums.js';

/** FR-02.2: single file max 10MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * FR-02.2: PDF, Word (.docx) and Excel (.xlsx). Excel is common for Japanese résumés and
 * skill sheets. Legacy binary formats (.doc / .xls) are not accepted — they need a parser
 * with a poor security record; users re-save them as .docx / .xlsx.
 */
export const ALLOWED_RESUME_MIME = [PDF_MIME, DOCX_MIME, XLSX_MIME] as const;
export const ALLOWED_RESUME_EXT = ['.pdf', '.docx', '.xlsx'] as const;

const MIME_BY_EXT: Record<(typeof ALLOWED_RESUME_EXT)[number], string> = {
  '.pdf': PDF_MIME,
  '.docx': DOCX_MIME,
  '.xlsx': XLSX_MIME,
};

/**
 * Browsers report an empty or generic type for Office files when the OS has no handler
 * registered (e.g. Windows without Office). For those generic values the type is taken
 * from the extension; the server's content sniffing still verifies the actual bytes.
 */
const GENERIC_MIME = new Set([
  '',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'binary/octet-stream',
]);

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
}

/** Canonical MIME for an upload: the declared type, or the extension's type when generic. */
export function normalizeResumeMime(filename: string, mime: string): string {
  const declared = (mime ?? '').trim().toLowerCase();
  if (!GENERIC_MIME.has(declared)) return declared;
  const ext = extensionOf(filename) as (typeof ALLOWED_RESUME_EXT)[number];
  return MIME_BY_EXT[ext] ?? declared;
}

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
  const ext = extensionOf(file.filename);
  if (!ALLOWED_RESUME_EXT.includes(ext as (typeof ALLOWED_RESUME_EXT)[number])) {
    return 'resume.upload.badExtension';
  }
  const mime = normalizeResumeMime(file.filename, file.mime);
  if (!ALLOWED_RESUME_MIME.includes(mime as (typeof ALLOWED_RESUME_MIME)[number])) {
    return 'resume.upload.badMime';
  }
  // The declared type must belong to the extension (no PDF bytes declared as .xlsx, etc.).
  if (MIME_BY_EXT[ext as (typeof ALLOWED_RESUME_EXT)[number]] !== mime) {
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
