import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestApp, createUser, type TestApp, type TestUser } from '../src/testing/harness.js';

let t: TestApp;
let seeker: TestUser;
let company: TestUser;
let stranger: TestUser;
let conversationId: string;

beforeAll(async () => {
  t = await createTestApp();
  seeker = await createUser(t, { role: 'job_seeker', displayName: 'Aoi' });
  company = await createUser(t, { role: 'company_member', displayName: 'Recruiter' });
  stranger = await createUser(t, { role: 'job_seeker', displayName: 'Nosy' });

  const res = await t.app.inject({
    method: 'POST',
    url: '/api/conversations',
    headers: company.headers,
    payload: { participantUserId: seeker.user.id, subject: 'Opportunity', initialMessage: 'Hello!' },
  });
  conversationId = res.json().id;
});
afterAll(async () => {
  await t.close();
});

describe('messaging + notifications (FR-08)', () => {
  it('creates a conversation visible to both members with the initial message', async () => {
    const list = await t.app.inject({ method: 'GET', url: '/api/conversations', headers: seeker.headers });
    expect(list.json().some((c: { id: string }) => c.id === conversationId)).toBe(true);
    const msgs = await t.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      headers: company.headers,
    });
    expect(msgs.json()[0].body).toBe('Hello!');
  });

  it('tracks unread counts and clears them on read', async () => {
    // company already sent the initial message → seeker has 1 unread.
    const before = await t.app.inject({ method: 'GET', url: '/api/conversations', headers: seeker.headers });
    expect(before.json().find((c: { id: string }) => c.id === conversationId).unreadCount).toBe(1);
    await t.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      headers: seeker.headers,
    });
    const after = await t.app.inject({ method: 'GET', url: '/api/conversations', headers: seeker.headers });
    expect(after.json().find((c: { id: string }) => c.id === conversationId).unreadCount).toBe(0);
  });

  it('delivers a notification to the recipient on a new message', async () => {
    await t.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: seeker.headers,
      payload: { body: 'Thanks for reaching out.' },
    });
    const notifs = await t.app.inject({ method: 'GET', url: '/api/notifications', headers: company.headers });
    expect(notifs.json().some((n: { type: string }) => n.type === 'message')).toBe(true);
  });

  it('rejects empty and over-long messages (FR-08.4)', async () => {
    const empty = await t.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: seeker.headers,
      payload: { body: '   ' },
    });
    expect(empty.statusCode).toBe(422);
    const long = await t.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: seeker.headers,
      payload: { body: 'a'.repeat(4001) },
    });
    expect(long.statusCode).toBe(422);
  });

  it('de-dupes duplicate submits via client token (FR-08.4)', async () => {
    const token = randomUUID();
    const send = () =>
      t.app.inject({
        method: 'POST',
        url: `/api/conversations/${conversationId}/messages`,
        headers: seeker.headers,
        payload: { body: 'dup', clientToken: token },
      });
    const a = await send();
    const b = await send();
    expect(a.json().id).toBe(b.json().id);
  });

  it('stores message bodies verbatim (XSS handled at render, not by mutation)', async () => {
    const payload = '<script>alert(1)</script>';
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: seeker.headers,
      payload: { body: payload },
    });
    expect(res.json().body).toBe(payload);
  });

  it('forbids a non-member from reading or writing (negative authz)', async () => {
    const read = await t.app.inject({
      method: 'GET',
      url: `/api/conversations/${conversationId}/messages`,
      headers: stranger.headers,
    });
    expect(read.statusCode).toBe(404);
    const write = await t.app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: stranger.headers,
      payload: { body: 'let me in' },
    });
    expect([403, 404]).toContain(write.statusCode);
  });

  it('requires authentication', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/conversations' });
    expect(res.statusCode).toBe(401);
  });
});
