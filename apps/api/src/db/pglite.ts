import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { buildClaims, type Db, type DbClient, type RequestContext } from './types.js';

interface PgliteQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>;
}

function wrap(q: PgliteQueryable): DbClient {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      const res = await q.query(sql, params ? [...params] : undefined);
      const rows = res.rows as T[];
      return { rows, rowCount: res.affectedRows ?? rows.length };
    },
  };
}

/** In-process Postgres (WASM) with pgvector. Used for local dev and the whole test suite. */
export class PgliteDb implements Db {
  private constructor(private readonly pg: PGlite) {}

  static async create(dataDir?: string): Promise<PgliteDb> {
    const pg = dataDir
      ? new PGlite(dataDir, { extensions: { vector } })
      : new PGlite({ extensions: { vector } });
    await pg.waitReady;
    return new PgliteDb(pg);
  }

  async exec(sql: string): Promise<void> {
    await this.pg.exec(sql);
  }

  async withContext<T>(ctx: RequestContext, fn: (client: DbClient) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx) => {
      if (ctx.role !== 'service') {
        await tx.query(`SET LOCAL ROLE ${ctx.role}`);
      }
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(buildClaims(ctx)),
      ]);
      return fn(wrap(tx as unknown as PgliteQueryable));
    }) as Promise<T>;
  }

  async service<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    return this.withContext({ role: 'service', userId: null }, fn);
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}
