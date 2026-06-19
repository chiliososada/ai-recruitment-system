import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { buildDeps } from '../src/deps.js';
import type { Db } from '../src/db/types.js';
import { createTestApp, type TestApp } from '../src/testing/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('health & readiness (BE-1)', () => {
  it('GET /health reports version, commit and uptime', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
    expect(body.commit).toBeTruthy();
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /ready returns 200 when the database is reachable', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready', checks: { database: 'ok' } });
  });

  it('GET /ready returns 503 when a dependency is down (not a static success)', async () => {
    const config = loadConfig({ NODE_ENV: 'test', ARS_RUNTIME: 'local', LOCAL_JWT_SECRET: 'x' });
    const downDb: Db = {
      service: async () => {
        throw new Error('db down');
      },
      withContext: async () => {
        throw new Error('db down');
      },
      exec: async () => undefined,
      close: async () => undefined,
    };
    const deps = await buildDeps(config, { db: downDb });
    const app = await buildServer(deps);
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(503);
      expect(res.json().checks.database).toBe('fail');
    } finally {
      await app.close();
    }
  });
});
