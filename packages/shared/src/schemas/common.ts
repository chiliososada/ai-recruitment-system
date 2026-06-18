import { z } from 'zod';

export const uuidSchema = z.string().uuid();
/** ISO-8601 timestamp string used in all API responses. */
export const isoTimestampSchema = z.string();

/** Trimmed, non-empty bounded text helper. */
export const boundedText = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

/** Optional bounded text that normalizes '' to undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
