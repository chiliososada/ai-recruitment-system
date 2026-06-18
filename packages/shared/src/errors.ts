import { z } from 'zod';

/** Machine-readable error codes returned by the API (NFR-API consistent errors). */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'VIRUS_DETECTED',
  'UPSTREAM_AI_ERROR',
  'INTERNAL',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Canonical HTTP status for each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  VIRUS_DETECTED: 422,
  UPSTREAM_AI_ERROR: 502,
  INTERNAL: 500,
};

/** A single field-level validation issue. */
export const FieldIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldIssue = z.infer<typeof FieldIssueSchema>;

/** Stable error envelope returned for every non-2xx response. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    /** i18n key the client may use to localize the message (FR-04.4). */
    messageKey: z.string().optional(),
    details: z.array(FieldIssueSchema).optional(),
    correlationId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
