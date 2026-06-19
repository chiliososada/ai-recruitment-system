import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../src/testing/harness.js';

/**
 * BE-3 — global rate limiting. Boots a dedicated app instance with a deliberately low ceiling
 * (RATE_LIMIT_MAX=2) and asserts the 3rd rapid request from the same client is rejected with
 * HTTP 429 and the canonical RATE_LIMITED error body (matches errorBody() in app.ts).
 *
 * The override flows through loadConfig → config.rateLimitMax, so the test-high default that keeps
 * every other suite from tripping the limiter is bypassed only here.
 */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({}, { RATE_LIMIT_MAX: '2' });
});
afterAll(async () => {
  await t.close();
});

describe('global rate limiting (BE-3)', () => {
  it('honours the configured RATE_LIMIT_MAX', () => {
    expect(t.deps.config.rateLimitMax).toBe(2);
  });

  it('returns 429 with the RATE_LIMITED body once the limit is exceeded', async () => {
    // Same client (consistent x-forwarded-for so the limiter keys them together).
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    const hit = () => t.app.inject({ method: 'GET', url: '/health', headers });

    const first = await hit();
    const second = await hit();
    const third = await hit();

    // First two are within the ceiling of 2.
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    // The 3rd rapid request trips the limiter.
    expect(third.statusCode).toBe(429);
    const body = third.json() as {
      error: { code: string; message: string; messageKey: string; correlationId: string };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.messageKey).toBe('error.rateLimited');
    expect(body.error.message).toBe('Too many requests');
    expect(body.error.correlationId).toBeTruthy();
  });
});
