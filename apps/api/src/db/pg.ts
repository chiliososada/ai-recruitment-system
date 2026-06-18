import pg from 'pg';
import { buildClaims, type Db, type DbClient, type RequestContext } from './types.js';

const { Pool } = pg;

/** node-postgres pool implementation for a real Supabase / Postgres instance. */
export class PgPoolDb implements Db {
  private constructor(private readonly pool: pg.Pool) {}

  static create(connectionString: string): PgPoolDb {
    return new PgPoolDb(new Pool({ connectionString, max: 10 }));
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async withContext<T>(ctx: RequestContext, fn: (client: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (ctx.role !== 'service') {
        await client.query(`SET LOCAL ROLE ${ctx.role}`);
      }
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(buildClaims(ctx)),
      ]);
      const dbClient: DbClient = {
        async query<R = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
          const r = await client.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as R[], rowCount: r.rowCount ?? r.rows.length };
        },
      };
      const out = await fn(dbClient);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async service<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    return this.withContext({ role: 'service', userId: null }, fn);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
