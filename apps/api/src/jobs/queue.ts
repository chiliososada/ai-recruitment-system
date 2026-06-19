import { randomUUID } from 'node:crypto';
import type { Logger } from '../logger.js';
import type { Db } from '../db/types.js';

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export interface EnqueueOptions {
  /** Unique key to de-dupe concurrent/duplicate enqueues (idempotency). */
  idempotencyKey?: string;
  maxAttempts?: number;
  runAfterMs?: number;
}

export interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'succeeded' | 'dead';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
}

export interface QueueConfig {
  inline: boolean;
  timeoutMs?: number;
  pollMs?: number;
  leaseMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`job timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Durable, recoverable job queue backed by Postgres (ID-2). Claims via
 * `FOR UPDATE SKIP LOCKED`, with attempts, exponential backoff, timeout, dead-letter and
 * idempotency. Runs on Supabase Postgres in prod and PGlite locally/in tests.
 */
export class JobQueue {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly workerId = `worker-${randomUUID().slice(0, 8)}`;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly leaseMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private loopTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private inflight = 0;

  constructor(
    private readonly db: Db,
    private readonly log: Logger,
    private readonly config: QueueConfig,
  ) {
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.pollMs = config.pollMs ?? 1_000;
    this.leaseMs = config.leaseMs ?? 60_000;
    this.baseBackoffMs = config.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = config.maxBackoffMs ?? 300_000;
  }

  get inline(): boolean {
    return this.config.inline;
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(
    kind: string,
    payload: Record<string, unknown>,
    opts: EnqueueOptions = {},
  ): Promise<{ id: string; deduped: boolean }> {
    const key = opts.idempotencyKey ?? null;
    const runAfterMs = opts.runAfterMs ?? 0;
    const inserted = await this.db.service((c) =>
      c.query<{ id: string }>(
        `insert into job_queue (kind, payload, idempotency_key, max_attempts, run_after)
         values ($1, $2::jsonb, $3, $4, now() + ($5 || ' milliseconds')::interval)
         on conflict (idempotency_key) do nothing
         returning id`,
        [kind, JSON.stringify(payload), key, opts.maxAttempts ?? 5, String(runAfterMs)],
      ),
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, deduped: false };
    // Conflict on idempotency key → return the existing job.
    const existing = await this.db.service((c) =>
      c.query<{ id: string }>(`select id from job_queue where idempotency_key = $1`, [key]),
    );
    return { id: existing.rows[0]?.id ?? '', deduped: true };
  }

  private async claim(): Promise<JobRow | null> {
    const res = await this.db.service((c) =>
      c.query<JobRow>(
        `with next as (
           select id from job_queue
           where status = 'queued' and run_after <= now()
           order by run_after
           for update skip locked
           limit 1
         )
         update job_queue j
            set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = $1, updated_at = now()
           from next where j.id = next.id
         returning j.id, j.kind, j.payload, j.status, j.attempts, j.max_attempts, j.last_error`,
        [this.workerId],
      ),
    );
    return res.rows[0] ?? null;
  }

  private async process(job: JobRow): Promise<void> {
    const handler = this.handlers.get(job.kind);
    if (!handler) {
      await this.markDead(job.id, `no handler for kind '${job.kind}'`);
      return;
    }
    try {
      await withTimeout(handler(job.payload), this.timeoutMs);
      await this.db.service((c) =>
        c.query(
          `update job_queue set status = 'succeeded', locked_at = null, locked_by = null, last_error = null where id = $1`,
          [job.id],
        ),
      );
    } catch (err) {
      const message = (err instanceof Error ? err.message : 'unknown error').slice(0, 500);
      if (job.attempts >= job.max_attempts) {
        await this.markDead(job.id, message);
        this.log.error({ jobId: job.id, kind: job.kind }, 'job dead-lettered');
      } else {
        const backoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** (job.attempts - 1));
        await this.db.service((c) =>
          c.query(
            `update job_queue set status = 'queued', locked_at = null, locked_by = null,
               last_error = $2, run_after = now() + ($3 || ' milliseconds')::interval where id = $1`,
            [job.id, message, String(backoff)],
          ),
        );
        this.log.warn(
          { jobId: job.id, kind: job.kind, attempt: job.attempts },
          'job failed; will retry',
        );
      }
    }
  }

  private async markDead(id: string, error: string): Promise<void> {
    await this.db.service((c) =>
      c.query(
        `update job_queue set status = 'dead', locked_at = null, last_error = $2 where id = $1`,
        [id, error],
      ),
    );
  }

  /** Claim + process a single ready job. Returns its id, or null if none ready. */
  async runOnce(): Promise<string | null> {
    const job = await this.claim();
    if (!job) return null;
    this.inflight += 1;
    try {
      await this.process(job);
      return job.id;
    } finally {
      this.inflight -= 1;
    }
  }

  /** Synchronously process all currently-ready jobs (deterministic inline mode). */
  async drainInline(limit = 1000): Promise<number> {
    let processed = 0;
    while (processed < limit) {
      const id = await this.runOnce();
      if (!id) break;
      processed += 1;
    }
    return processed;
  }

  /** Requeue jobs stuck in `running` past the lease (crashed worker recovery). */
  async recoverStuck(): Promise<number> {
    const res = await this.db.service((c) =>
      c.query<{ id: string }>(
        `update job_queue set status = 'queued', locked_at = null, locked_by = null
         where status = 'running' and locked_at < now() - ($1 || ' milliseconds')::interval
         returning id`,
        [String(this.leaseMs)],
      ),
    );
    return res.rows.length;
  }

  async stats(): Promise<Record<string, number>> {
    const res = await this.db.service((c) =>
      c.query<{ status: string; count: number }>(
        `select status, count(*)::int as count from job_queue group by status`,
      ),
    );
    const out: Record<string, number> = { queued: 0, running: 0, succeeded: 0, dead: 0 };
    for (const r of res.rows) out[r.status] = Number(r.count);
    return out;
  }

  start(): void {
    if (this.loopTimer || this.config.inline) return;
    const tick = async (): Promise<void> => {
      if (this.stopping) return;
      try {
        await this.recoverStuck();
        // Drain everything ready this tick.
        while (!this.stopping && (await this.runOnce())) {
          /* keep draining */
        }
      } catch (err) {
        this.log.error({ err }, 'worker tick error');
      } finally {
        if (!this.stopping) this.loopTimer = setTimeout(() => void tick(), this.pollMs);
      }
    };
    this.loopTimer = setTimeout(() => void tick(), this.pollMs);
    this.log.info({ workerId: this.workerId }, 'job worker started');
  }

  /** Graceful shutdown: stop the loop and wait for in-flight jobs to finish. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = null;
    const deadline = Date.now() + this.timeoutMs;
    while (this.inflight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.log.info('job worker stopped');
  }
}
