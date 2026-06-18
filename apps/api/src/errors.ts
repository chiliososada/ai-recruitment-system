import { ERROR_STATUS, type ApiErrorBody, type ErrorCode, type FieldIssue } from '@ars/shared';
import { ZodError, type ZodSchema } from 'zod';

/** Application error carrying a machine code + optional i18n key + field details. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly messageKey?: string,
    public readonly details?: FieldIssue[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toBody(correlationId: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.messageKey ? { messageKey: this.messageKey } : {}),
        ...(this.details ? { details: this.details } : {}),
        correlationId,
      },
    };
  }
}

export const badRequest = (message: string, messageKey = 'error.badRequest') =>
  new AppError('BAD_REQUEST', message, messageKey);
export const unauthorized = (message = 'Unauthorized', messageKey = 'error.unauthorized') =>
  new AppError('UNAUTHORIZED', message, messageKey);
export const forbidden = (message = 'Forbidden', messageKey = 'error.forbidden') =>
  new AppError('FORBIDDEN', message, messageKey);
export const notFound = (message = 'Not found', messageKey = 'error.notFound') =>
  new AppError('NOT_FOUND', message, messageKey);
export const conflict = (message: string, messageKey = 'error.conflict') =>
  new AppError('CONFLICT', message, messageKey);
export const validationError = (details: FieldIssue[], messageKey = 'error.validation') =>
  new AppError('VALIDATION', 'Validation failed', messageKey, details);
export const payloadTooLarge = (message: string, messageKey: string) =>
  new AppError('PAYLOAD_TOO_LARGE', message, messageKey);
export const unsupportedMedia = (message: string, messageKey: string) =>
  new AppError('UNSUPPORTED_MEDIA_TYPE', message, messageKey);
export const virusDetected = (messageKey = 'resume.upload.infected') =>
  new AppError('VIRUS_DETECTED', 'Uploaded file failed virus scan', messageKey);
export const upstreamAiError = (message: string) =>
  new AppError('UPSTREAM_AI_ERROR', message, 'error.aiUnavailable');

export function zodToIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/** Parse `data` with `schema`, throwing a VALIDATION AppError (field details) on failure. */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError(zodToIssues(result.error));
  return result.data;
}
