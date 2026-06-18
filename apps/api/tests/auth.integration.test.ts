import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../src/testing/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const register = (payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: '/api/auth/register', payload });

describe('auth (FR-01)', () => {
  it('registers a job seeker and returns a session with a dev verification token', async () => {
    const res = await register({
      email: 'seeker1@example.com',
      password: 'passw0rd1',
      role: 'job_seeker',
      displayName: 'Aoi',
      locale: 'ja',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({ email: 'seeker1@example.com', role: 'job_seeker', locale: 'ja' });
    expect(body.accessToken).toBeTruthy();
    expect(body.user.emailVerified).toBe(false);
    expect(body.devEmailVerificationToken).toBeTruthy();
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('registers a company member', async () => {
    const res = await register({
      email: 'company1@example.com',
      password: 'passw0rd1',
      role: 'company_member',
      displayName: 'Recruiter',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.role).toBe('company_member');
  });

  it('rejects a duplicate email with 409', async () => {
    await register({ email: 'dup@example.com', password: 'passw0rd1', role: 'job_seeker', displayName: 'A' });
    const dup = await register({
      email: 'dup@example.com',
      password: 'passw0rd1',
      role: 'job_seeker',
      displayName: 'B',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');
  });

  it('rejects a weak password with 422 and field details', async () => {
    const res = await register({
      email: 'weak@example.com',
      password: 'short',
      role: 'job_seeker',
      displayName: 'A',
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('logs in with valid credentials and reads /auth/me', async () => {
    await register({ email: 'login@example.com', password: 'passw0rd1', role: 'job_seeker', displayName: 'Lo' });
    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'passw0rd1' },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().accessToken;
    const me = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('login@example.com');
  });

  it('rejects bad credentials with 401', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'wrongpass1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('verifies email via the dev token and returns a verified session', async () => {
    const reg = await register({
      email: 'verify@example.com',
      password: 'passw0rd1',
      role: 'job_seeker',
      displayName: 'V',
    });
    const token = reg.json().devEmailVerificationToken;
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.emailVerified).toBe(true);
  });

  it('rejects /auth/me without a token (401)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('updates account display name + locale', async () => {
    const reg = await register({
      email: 'acct@example.com',
      password: 'passw0rd1',
      role: 'job_seeker',
      displayName: 'Old',
    });
    const token = reg.json().accessToken;
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/auth/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'New Name', locale: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ displayName: 'New Name', locale: 'en' });
  });

  it('exposes health + openapi', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const spec = await t.app.inject({ method: 'GET', url: '/openapi.json' });
    expect(spec.statusCode).toBe(200);
    expect(spec.json().openapi).toBeTruthy();
  });
});
