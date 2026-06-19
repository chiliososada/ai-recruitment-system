import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../src/testing/harness.js';

/**
 * BE-4 — OpenAPI contract test. Boots the real server and asserts the published spec at
 * /openapi.json is valid JSON, carries the OpenAPI envelope, and documents the key routes the
 * SPA + external clients depend on. Deterministic: no auth, no DB writes, no time/randomness.
 */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('OpenAPI contract (BE-4)', () => {
  it('serves a valid OpenAPI document at GET /openapi.json', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);

    // Must parse as JSON (inject gives us the raw body string).
    const spec = JSON.parse(res.body) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };

    expect(typeof spec.openapi).toBe('string');
    expect(spec.openapi.startsWith('3.')).toBe(true);
    expect(spec.info).toBeTruthy();
    expect(spec.info.title).toBe('AI Recruitment System API');
    expect(spec.info.version).toBeTruthy();
    expect(spec.paths && typeof spec.paths).toBe('object');
  });

  it('documents the key routes clients depend on', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = JSON.parse(res.body) as { paths: Record<string, Record<string, unknown>> };
    const paths = Object.keys(spec.paths);

    // Real paths taken from the running spec (the `/api` prefix is applied by app.ts).
    const expected = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/candidates/me/resume',
      '/api/jobs',
      '/api/companies',
    ];
    for (const p of expected) {
      expect(paths).toContain(p);
    }

    // Spot-check the HTTP verbs are documented on a couple of these.
    expect(spec.paths['/api/auth/login']).toHaveProperty('post');
    expect(spec.paths['/api/candidates/me/resume']).toHaveProperty('post');
    expect(spec.paths['/api/jobs']).toHaveProperty('get');
  });
});
