/**
 * PERF-2: API/DB latency benchmark on seed data.
 *
 * Boots the real server against an in-process Postgres (PGlite) with deterministic mocks,
 * seeds a realistic dataset, then measures p50/p95/max latency for the hot read/write paths
 * via in-process injection (handler + DB time, no network). Run:
 *
 *   npx tsx apps/api/scripts/benchmark.ts
 *
 * Prints a Markdown table (paste into docs/PERFORMANCE.md) and a PERF_JSON line for tooling.
 */
import { performance } from 'node:perf_hooks';
import {
  createCompanyAndJob,
  createTestApp,
  createUser,
  uploadSampleResume,
} from '../src/testing/harness.js';

const ITERATIONS = Number(process.env.BENCH_ITER ?? 60);
const WARMUP = 8;

function percentile(sortedMs: number[], p: number): number {
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)]!;
}

async function measure(
  label: string,
  fn: () => Promise<{ statusCode: number }>,
): Promise<{ label: string; n: number; status: number; p50: number; p95: number; max: number }> {
  let status = 0;
  for (let i = 0; i < WARMUP; i++) status = (await fn()).statusCode;
  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const res = await fn();
    times.push(performance.now() - start);
    status = res.statusCode;
  }
  times.sort((a, b) => a - b);
  return {
    label,
    n: ITERATIONS,
    status,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times[times.length - 1]!,
  };
}

async function main(): Promise<void> {
  const t = await createTestApp();
  try {
    // ---- seed a realistic dataset ----
    const company = await createUser(t, { role: 'company_member' });
    const { jobId } = await createCompanyAndJob(t, company);
    for (let i = 0; i < 12; i++) {
      await createCompanyAndJob(t, company, { title: `Engineer Role ${i}` });
    }
    const seekers = [];
    for (let i = 0; i < 8; i++) {
      const u = await createUser(t, { role: 'job_seeker' });
      await uploadSampleResume(t, u);
      seekers.push(u);
    }
    const seeker = seekers[0]!;

    const scenarios: [string, () => Promise<{ statusCode: number }>][] = [
      ['GET /api/jobs (public list)', () => t.app.inject({ method: 'GET', url: '/api/jobs' })],
      ['GET /api/companies (list)', () => t.app.inject({ method: 'GET', url: '/api/companies' })],
      [
        'GET /api/jobs/:id (detail)',
        () => t.app.inject({ method: 'GET', url: `/api/jobs/${jobId}` }),
      ],
      [
        'POST /api/auth/login',
        () =>
          t.app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: seeker.email, password: seeker.password },
          }),
      ],
      [
        'GET /api/candidates/me/recommendations',
        () =>
          t.app.inject({
            method: 'GET',
            url: '/api/candidates/me/recommendations',
            headers: seeker.headers,
          }),
      ],
      [
        'GET /api/talent (search)',
        () => t.app.inject({ method: 'GET', url: '/api/talent', headers: company.headers }),
      ],
      [
        'GET /api/notifications',
        () => t.app.inject({ method: 'GET', url: '/api/notifications', headers: seeker.headers }),
      ],
      ['GET /health', () => t.app.inject({ method: 'GET', url: '/health' })],
    ];

    const rows = [];
    for (const [label, fn] of scenarios) rows.push(await measure(label, fn));

    const fmt = (n: number) => n.toFixed(1);
    const seedSummary = `13 jobs, 8 candidates (with parsed résumés + embeddings), 1 company`;
    console.log(`\nSeed: ${seedSummary}`);
    console.log(
      `Iterations per scenario: ${ITERATIONS} (after ${WARMUP} warmup), in-process inject\n`,
    );
    console.log('| Endpoint | status | p50 (ms) | p95 (ms) | max (ms) |');
    console.log('| --- | --- | --- | --- | --- |');
    for (const r of rows) {
      console.log(`| ${r.label} | ${r.status} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} |`);
    }
    console.log(
      `\nPERF_JSON ${JSON.stringify({ seed: seedSummary, iterations: ITERATIONS, rows })}`,
    );

    const bad = rows.filter((r) => r.status >= 400);
    if (bad.length) {
      console.error(
        `\nFAIL: ${bad.length} scenario(s) returned >=400: ${bad.map((b) => b.label).join(', ')}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await t.close();
  }
}

void main();
