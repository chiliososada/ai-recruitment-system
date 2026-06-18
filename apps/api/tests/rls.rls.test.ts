import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestContext } from '../src/db/types.js';
import {
  createCompanyAndJob,
  createTestApp,
  createUser,
  uploadSampleResume,
  type TestApp,
  type TestUser,
} from '../src/testing/harness.js';

let t: TestApp;
let seeker: TestUser; // job_seeker, owns a resume + an application
let seeker2: TestUser; // a second, unrelated job_seeker
let companyA: TestUser; // company_member, owns companyA + jobA (open/public) + a draft
let companyB: TestUser; // company_member at a different company
let companyAId: string;
let jobA: string;
let draftJobId: string;
let seekerCandidateId: string;
let seeker2CandidateId: string;
let seekerResumeFileId: string;
let seeker2ResumeFileId: string;
let conversationId: string;
let applicationId: string;
let seekerNotifId: string;
let companyANotifId: string;

/** Run a query under a given Postgres role/identity (RLS enforced for anon/authenticated). */
function asRole<T = Record<string, unknown>>(ctx: RequestContext, sql: string, params?: unknown[]) {
  return t.deps.db.withContext(ctx, (c) => c.query<T>(sql, params));
}
const authed = (u: TestUser): RequestContext => ({
  role: 'authenticated',
  userId: u.user.id,
  email: u.email,
});
const anon: RequestContext = { role: 'anon', userId: null };

/** Rows a role can actually read: a blocked grant (permission denied) counts as 0 readable rows. */
async function readableRowCount(ctx: RequestContext, sql: string): Promise<number> {
  try {
    return (await asRole(ctx, sql)).rows.length;
  } catch (err) {
    if (err instanceof Error && /permission denied/i.test(err.message)) return 0;
    throw err;
  }
}

beforeAll(async () => {
  t = await createTestApp();

  seeker = await createUser(t, { role: 'job_seeker', displayName: 'Aoi' });
  seeker2 = await createUser(t, { role: 'job_seeker', displayName: 'Ben' });
  await uploadSampleResume(t, seeker);
  await uploadSampleResume(t, seeker2);

  companyA = await createUser(t, { role: 'company_member', displayName: 'Recruiter A' });
  companyB = await createUser(t, { role: 'company_member', displayName: 'Recruiter B' });
  await createCompanyAndJob(t, companyB); // B needs a membership to act as a recruiter
  ({ companyId: companyAId, jobId: jobA } = await createCompanyAndJob(t, companyA));
  ({ jobId: draftJobId } = await createCompanyAndJob(t, companyA, {
    title: 'Secret Role',
    status: 'draft',
    visibility: 'private',
  }));

  // Candidate ids (via service, bypassing RLS just to fetch fixtures' ids).
  const cand = await t.deps.db.service((c) =>
    c.query<{ id: string; user_id: string }>(`select id, user_id from candidates`),
  );
  seekerCandidateId = cand.rows.find((r) => r.user_id === seeker.user.id)!.id;
  seeker2CandidateId = cand.rows.find((r) => r.user_id === seeker2.user.id)!.id;

  const rf = await t.deps.db.service((c) =>
    c.query<{ id: string; candidate_id: string }>(`select id, candidate_id from resume_files`),
  );
  seekerResumeFileId = rf.rows.find((r) => r.candidate_id === seekerCandidateId)!.id;
  seeker2ResumeFileId = rf.rows.find((r) => r.candidate_id === seeker2CandidateId)!.id;

  // Seeker applies to A's open job → application owned by seeker + company A.
  const apply = await t.app.inject({
    method: 'POST',
    url: '/api/applications',
    headers: seeker.headers,
    payload: { jobId: jobA },
  });
  if (apply.statusCode !== 201) throw new Error(`apply failed: ${apply.body}`);
  applicationId = apply.json().id;

  // Conversation set up via the messaging HTTP route (company A <-> seeker).
  const conv = await t.app.inject({
    method: 'POST',
    url: '/api/conversations',
    headers: companyA.headers,
    payload: { participantUserId: seeker.user.id, subject: 'Chat', initialMessage: 'Hi' },
  });
  if (conv.statusCode !== 201) throw new Error(`conversation failed: ${conv.body}`);
  conversationId = conv.json().id;

  const notifs = await t.deps.db.service((c) =>
    c.query<{ id: string; user_id: string }>(`select id, user_id from notifications`),
  );
  seekerNotifId = notifs.rows.find((r) => r.user_id === seeker.user.id)?.id ?? '';
  companyANotifId = notifs.rows.find((r) => r.user_id === companyA.user.id)?.id ?? '';
});

afterAll(async () => {
  await t.close();
});

describe('RLS: candidates (FR-01.5, §4)', () => {
  it('owner can SELECT their own candidate row', async () => {
    const res = await asRole(authed(seeker), `select id from candidates where id = $1`, [
      seekerCandidateId,
    ]);
    expect(res.rows).toHaveLength(1);
  });

  it('another seeker (not a recruiter) CANNOT see it', async () => {
    const res = await asRole(authed(seeker2), `select id from candidates where id = $1`, [
      seekerCandidateId,
    ]);
    expect(res.rows).toHaveLength(0);
  });

  it('a recruiter CAN see open_to_work candidates', async () => {
    // companyB is a recruiter unrelated to the seeker, but the candidate is open_to_work.
    const res = await asRole(authed(companyB), `select id from candidates where id = $1`, [
      seekerCandidateId,
    ]);
    expect(res.rows).toHaveLength(1);
  });
});

describe('RLS: resume_files (owner-only, FR-02.3)', () => {
  it('owner sees their resume_files row', async () => {
    const res = await asRole(authed(seeker), `select id from resume_files where id = $1`, [
      seekerResumeFileId,
    ]);
    expect(res.rows).toHaveLength(1);
  });

  it('another user sees 0 rows for it', async () => {
    const asOtherSeeker = await asRole(authed(seeker2), `select id from resume_files where id = $1`, [
      seekerResumeFileId,
    ]);
    expect(asOtherSeeker.rows).toHaveLength(0);

    // Even a recruiter cannot read resume_files directly (download is mediated by the API+service).
    const asRecruiter = await asRole(authed(companyA), `select id from resume_files where id = $1`, [
      seekerResumeFileId,
    ]);
    expect(asRecruiter.rows).toHaveLength(0);
  });

  it('the second seeker only sees their own resume, never the first seeker\'s', async () => {
    const res = await asRole(authed(seeker2), `select id, candidate_id from resume_files`);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.id).toBe(seeker2ResumeFileId);
  });
});

describe('RLS: jobs (visibility/status gate)', () => {
  it('a draft/private job is NOT visible to anon nor a non-member', async () => {
    const asAnon = await asRole(anon, `select id from jobs where id = $1`, [draftJobId]);
    expect(asAnon.rows).toHaveLength(0);

    const asNonMember = await asRole(authed(companyB), `select id from jobs where id = $1`, [draftJobId]);
    expect(asNonMember.rows).toHaveLength(0);
  });

  it('the owning company member CAN see the draft job', async () => {
    const res = await asRole(authed(companyA), `select id from jobs where id = $1`, [draftJobId]);
    expect(res.rows).toHaveLength(1);
  });

  it('an open + public job IS visible to anon', async () => {
    const res = await asRole(anon, `select id from jobs where id = $1`, [jobA]);
    expect(res.rows).toHaveLength(1);
  });
});

describe('RLS: conversations + messages (members only, FR-08)', () => {
  it('members can SELECT the conversation', async () => {
    const asCompany = await asRole(authed(companyA), `select id from conversations where id = $1`, [
      conversationId,
    ]);
    expect(asCompany.rows).toHaveLength(1);
    const asSeeker = await asRole(authed(seeker), `select id from conversations where id = $1`, [
      conversationId,
    ]);
    expect(asSeeker.rows).toHaveLength(1);
  });

  it('a non-member sees 0 conversation rows and 0 messages', async () => {
    const conv = await asRole(authed(seeker2), `select id from conversations where id = $1`, [
      conversationId,
    ]);
    expect(conv.rows).toHaveLength(0);
    const msgs = await asRole(authed(seeker2), `select id from messages where conversation_id = $1`, [
      conversationId,
    ]);
    expect(msgs.rows).toHaveLength(0);
  });

  it('a member CAN read the messages', async () => {
    const msgs = await asRole(authed(seeker), `select id from messages where conversation_id = $1`, [
      conversationId,
    ]);
    expect(msgs.rows.length).toBeGreaterThan(0);
  });
});

describe('RLS: applications (candidate + owning company)', () => {
  it('the owning candidate CAN SELECT the application', async () => {
    const res = await asRole(authed(seeker), `select id from applications where id = $1`, [applicationId]);
    expect(res.rows).toHaveLength(1);
  });

  it('the owning company member CAN SELECT the application', async () => {
    const res = await asRole(authed(companyA), `select id from applications where id = $1`, [applicationId]);
    expect(res.rows).toHaveLength(1);
  });

  it('a different company sees 0 rows', async () => {
    const res = await asRole(authed(companyB), `select id from applications where id = $1`, [applicationId]);
    expect(res.rows).toHaveLength(0);
  });
});

describe('RLS: notifications (owner only)', () => {
  it('a user sees only their own notifications', async () => {
    expect(seekerNotifId).not.toBe('');
    expect(companyANotifId).not.toBe('');

    // Seeker can see their own notification but not company A's.
    const own = await asRole(authed(seeker), `select id from notifications where id = $1`, [seekerNotifId]);
    expect(own.rows).toHaveLength(1);
    const foreign = await asRole(authed(seeker), `select id from notifications where id = $1`, [
      companyANotifId,
    ]);
    expect(foreign.rows).toHaveLength(0);

    // Every row a user can see belongs to them.
    const all = await asRole<{ user_id: string }>(authed(seeker), `select user_id from notifications`);
    expect(all.rows.every((r) => r.user_id === seeker.user.id)).toBe(true);
  });
});

describe('RLS: anon role (no PII, public companies only)', () => {
  it('anon CANNOT read any profiles or candidates', async () => {
    // Defense in depth: anon has no table-level SELECT grant on these PII tables, so the
    // read is rejected outright (a stronger guarantee than RLS returning 0 rows). Assert
    // that no rows are ever obtainable, whether by grant denial or by an empty result set.
    expect(await readableRowCount(anon, `select id from profiles`)).toBe(0);
    expect(await readableRowCount(anon, `select id from candidates`)).toBe(0);
  });

  it('anon CAN select public companies', async () => {
    const res = await asRole(anon, `select id from companies where id = $1`, [companyAId]);
    expect(res.rows).toHaveLength(1);
  });
});
