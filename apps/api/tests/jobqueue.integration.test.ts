import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobQueue } from '../src/jobs/queue.js';
import { createTestApp, type TestApp } from '../src/testing/harness.js';

let t: TestApp;
let q: JobQueue;
let attempts: Record<string, number>;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.deps.db.service((c) => c.query('delete from job_queue'));
  attempts = {};
  // Fresh queue with zero backoff + short timeout for deterministic mechanics.
  q = new JobQueue(t.deps.db, t.deps.log, {
    inline: true,
    baseBackoffMs: 0,
    maxBackoffMs: 0,
    timeoutMs: 100,
    leaseMs: 50,
  });
  q.register('ok', async () => undefined);
  q.register('boom', async () => {
    throw new Error('boom');
  });
  q.register('flaky', async (p) => {
    const id = String(p.id);
    attempts[id] = (attempts[id] ?? 0) + 1;
    if (attempts[id] < 2) throw new Error('transient');
  });
  q.register('slow', async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
});

describe('durable job queue (JOBS)', () => {
  it('processes a job to succeeded', async () => {
    await q.enqueue('ok', {});
    expect(await q.runOnce()).toBeTruthy();
    expect((await q.stats()).succeeded).toBe(1);
  });

  it('de-dupes on idempotency key', async () => {
    const a = await q.enqueue('ok', {}, { idempotencyKey: 'k1' });
    const b = await q.enqueue('ok', {}, { idempotencyKey: 'k1' });
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
    expect(b.id).toBe(a.id);
    expect((await q.stats()).queued).toBe(1);
  });

  it('retries with attempts then succeeds (flaky)', async () => {
    await q.enqueue('flaky', { id: 'f1' }, { maxAttempts: 3 });
    await q.runOnce(); // attempt 1 → throws → requeued (backoff 0)
    await q.runOnce(); // attempt 2 → succeeds
    expect((await q.stats()).succeeded).toBe(1);
    expect(attempts['f1']).toBe(2);
  });

  it('dead-letters after exhausting attempts', async () => {
    await q.enqueue('boom', {}, { maxAttempts: 2 });
    await q.runOnce(); // attempt 1 → requeued
    await q.runOnce(); // attempt 2 → dead
    expect((await q.stats()).dead).toBe(1);
    const dead = await t.deps.db.service((c) =>
      c.query<{ last_error: string }>(`select last_error from job_queue where status='dead'`),
    );
    expect(dead.rows[0]?.last_error).toContain('boom');
  });

  it('times out a slow job and counts it as a failure', async () => {
    await q.enqueue('slow', {}, { maxAttempts: 1 });
    await q.runOnce(); // exceeds 100ms timeout → fails → dead (max 1)
    expect((await q.stats()).dead).toBe(1);
    const dead = await t.deps.db.service((c) =>
      c.query<{ last_error: string }>(`select last_error from job_queue where status='dead'`),
    );
    expect(dead.rows[0]?.last_error).toContain('timed out');
  });

  it('recovers jobs stuck in running past the lease', async () => {
    const { id } = await q.enqueue('ok', {});
    await t.deps.db.service((c) =>
      c.query(
        `update job_queue set status='running', locked_at = now() - interval '10 seconds' where id=$1`,
        [id],
      ),
    );
    expect(await q.recoverStuck()).toBe(1);
    expect((await q.stats()).queued).toBe(1);
  });

  it('dead-letters a job with no registered handler', async () => {
    await q.enqueue('unknown_kind', {}, { maxAttempts: 3 });
    await q.runOnce();
    expect((await q.stats()).dead).toBe(1);
  });
});
