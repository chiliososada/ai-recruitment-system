/** Minimal row-shape returned by queries. */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

/** Postgres role a request runs as. `service` bypasses RLS (trusted server ops only). */
export type DbRole = 'authenticated' | 'anon' | 'service';

export interface RequestContext {
  role: DbRole;
  userId?: string | null;
  email?: string | null;
}

/**
 * Database abstraction. `withContext` opens a transaction, switches to the request's
 * Postgres role and sets `request.jwt.claims`, so the SAME RLS policies that protect a
 * real Supabase project also block IDOR/cross-tenant access here (D-005).
 */
export interface Db {
  withContext<T>(ctx: RequestContext, fn: (client: DbClient) => Promise<T>): Promise<T>;
  service<T>(fn: (client: DbClient) => Promise<T>): Promise<T>;
  /** Run raw SQL as the superuser/owner (migrations, bootstrap). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Claims placed into `request.jwt.claims`; `auth.uid()/role()` read from these. */
export function buildClaims(ctx: RequestContext): Record<string, unknown> {
  return {
    sub: ctx.userId ?? null,
    role: ctx.role === 'service' ? 'service_role' : ctx.role,
    email: ctx.email ?? null,
  };
}

export const ANON: RequestContext = { role: 'anon', userId: null };
