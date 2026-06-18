import type { TFunction } from 'i18next';
import { ApiError } from './api';

const CODE_KEY: Record<string, string> = {
  UNAUTHORIZED: 'error.unauthorized',
  FORBIDDEN: 'error.forbidden',
  NOT_FOUND: 'error.notFound',
  CONFLICT: 'error.conflict',
  VALIDATION: 'error.validation',
  RATE_LIMITED: 'error.rateLimited',
  PAYLOAD_TOO_LARGE: 'resume.upload.tooLarge',
  UNSUPPORTED_MEDIA_TYPE: 'resume.upload.badMime',
  VIRUS_DETECTED: 'resume.upload.infected',
  UPSTREAM_AI_ERROR: 'error.aiUnavailable',
  BAD_REQUEST: 'error.badRequest',
  INTERNAL: 'error.internal',
};

/** Turn any thrown error into a localized, user-facing message. */
export function localizeError(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.messageKey) {
      const fallback = t(CODE_KEY[err.code] ?? 'error.internal');
      return t(err.messageKey, { defaultValue: fallback });
    }
    return t(CODE_KEY[err.code] ?? 'error.internal');
  }
  return t('error.network');
}

/** Map VALIDATION field issues to a `{ path: localizedMessage }` record. */
export function localizeFieldErrors(t: TFunction, err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION') return {};
  const out: Record<string, string> = {};
  for (const issue of err.details) {
    out[issue.path] = t(issue.message, { defaultValue: issue.message });
  }
  return out;
}
