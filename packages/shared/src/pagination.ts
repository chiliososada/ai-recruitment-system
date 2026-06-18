import { z } from 'zod';

/** Common pagination + sorting query (FR-06.1, FR-07.2). Coerced from query strings. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Envelope for every list endpoint. Totals come from a DB COUNT, never the client. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Convert page/pageSize to SQL LIMIT/OFFSET. */
export function toLimitOffset(query: { page: number; pageSize: number }): {
  limit: number;
  offset: number;
} {
  return { limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
}
