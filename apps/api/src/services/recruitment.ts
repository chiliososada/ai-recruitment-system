import {
  STAGE_TRANSITIONS,
  type AddShortlistInput,
  type Application,
  type CompareRequestInput,
  type ComparisonCandidate,
  type ComparisonResult,
  type CreateApplicationInput,
  type Interview,
  type InterviewMode,
  type InterviewStatus,
  type ProficiencyLevel,
  type ProposeInterviewInput,
  type RecruitmentStage,
  type RespondInterviewInput,
  type ShortlistEntry,
  type StageHistory,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import type { RequestContext } from '../db/types.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import type { Principal } from '../http/context.js';
import { userChannel } from '../realtime.js';
import { pgArrayLiteral, toIso } from '../util.js';
import { getCandidateIdForUser } from './candidate.js';
import { computeMatchesForCandidate, computeMatchesForJob } from './matching.js';
import { createNotification } from './messaging.js';

const ctx = (p: Principal): RequestContext => ({
  role: 'authenticated',
  userId: p.userId,
  email: p.email,
});

interface ApplicationRow {
  id: string;
  job_id: string;
  candidate_id: string;
  stage: RecruitmentStage;
  cover_note: string | null;
  created_at: unknown;
  updated_at: unknown;
  job_title?: string;
  company_id?: string;
  company_name?: string;
  candidate_name?: string;
  match_score?: number | null;
}

function mapApplication(r: ApplicationRow): Application {
  return {
    id: r.id,
    jobId: r.job_id,
    candidateId: r.candidate_id,
    stage: r.stage,
    coverNote: r.cover_note,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    ...(r.job_title ? { jobTitle: r.job_title } : {}),
    ...(r.company_id ? { companyId: r.company_id } : {}),
    ...(r.company_name ? { companyName: r.company_name } : {}),
    ...(r.candidate_name ? { candidateName: r.candidate_name } : {}),
    ...(r.match_score !== undefined ? { matchScore: r.match_score } : {}),
  };
}

async function notify(
  deps: Deps,
  userId: string,
  type: Parameters<typeof createNotification>[2],
  title: string,
  body: string | null,
  link: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  await deps.db.service((c) => createNotification(c, userId, type, title, body, link, data));
  deps.bus.publish(userChannel(userId), { type: 'notification', payload: { kind: type, ...data } });
}

export async function applyToJob(
  deps: Deps,
  principal: Principal,
  input: CreateApplicationInput,
): Promise<Application> {
  const candidateId = await getCandidateIdForUser(deps, principal.userId);
  const application = await deps.db.withContext(ctx(principal), async (c) => {
    const jobOk = await c.query(
      `select 1 from jobs where id = $1 and status = 'open' and visibility = 'public'`,
      [input.jobId],
    );
    if (!jobOk.rows.length) throw notFound('Job not open for applications', 'job.notFound');
    let inserted;
    try {
      inserted = await c.query<ApplicationRow>(
        `insert into applications (job_id, candidate_id, cover_note)
         values ($1, $2, $3)
         returning id, job_id, candidate_id, stage, cover_note, created_at, updated_at`,
        [input.jobId, candidateId, input.coverNote ?? null],
      );
    } catch (err) {
      if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
        throw conflict('Already applied to this job', 'application.duplicate');
      }
      throw err;
    }
    const app = inserted.rows[0]!;
    await c.query(
      `insert into application_stage_history (application_id, from_stage, to_stage, changed_by)
       values ($1, null, 'applied', $2)`,
      [app.id, principal.userId],
    );
    return app;
  });

  // Notify company members of the job's company.
  await deps.db.service(async (c) => {
    const members = await c.query<{ user_id: string; title: string }>(
      `select m.user_id, j.title from jobs j
       join company_members m on m.company_id = j.company_id
       where j.id = $1`,
      [input.jobId],
    );
    for (const m of members.rows) {
      await createNotification(
        c,
        m.user_id,
        'application_received',
        'New application',
        m.title,
        `/console/jobs/${input.jobId}/applications`,
        {
          jobId: input.jobId,
          applicationId: application.id,
        },
      );
      deps.bus.publish(userChannel(m.user_id), {
        type: 'notification',
        payload: { kind: 'application_received' },
      });
    }
  });

  // Ensure a fresh match score exists for this candidate (incl. the applied job).
  await computeMatchesForCandidate(deps, candidateId);
  return mapApplication(application);
}

export async function listMyApplications(deps: Deps, principal: Principal): Promise<Application[]> {
  const candidateId = await getCandidateIdForUser(deps, principal.userId);
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<ApplicationRow>(
      `select a.id, a.job_id, a.candidate_id, a.stage, a.cover_note, a.created_at, a.updated_at,
              j.title as job_title, j.company_id, co.name as company_name
       from applications a join jobs j on j.id = a.job_id join companies co on co.id = j.company_id
       where a.candidate_id = $1 order by a.created_at desc`,
      [candidateId],
    ),
  );
  return res.rows.map(mapApplication);
}

export async function listJobApplications(
  deps: Deps,
  principal: Principal,
  jobId: string,
): Promise<Application[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<ApplicationRow>(
      `select a.id, a.job_id, a.candidate_id, a.stage, a.cover_note, a.created_at, a.updated_at,
              p.display_name as candidate_name,
              (select score from match_results mr where mr.job_id = a.job_id and mr.candidate_id = a.candidate_id) as match_score
       from applications a
       join candidates cd on cd.id = a.candidate_id
       join profiles p on p.id = cd.user_id
       where a.job_id = $1 order by a.created_at desc`,
      [jobId],
    ),
  );
  // RLS already restricts to the owning company; a non-member simply sees nothing.
  return res.rows.map(mapApplication);
}

export async function updateApplicationStage(
  deps: Deps,
  principal: Principal,
  applicationId: string,
  stage: RecruitmentStage,
  note: string | undefined,
): Promise<Application> {
  const result = await deps.db.withContext(ctx(principal), async (c) => {
    const current = await c.query<{
      stage: RecruitmentStage;
      candidate_id: string;
      job_id: string;
    }>(`select stage, candidate_id, job_id from applications where id = $1`, [applicationId]);
    if (!current.rows.length) throw notFound('Application not found', 'application.notFound');
    const from = current.rows[0]!.stage;
    if (from === stage) throw badRequest('No stage change', 'application.sameStage');
    if (!STAGE_TRANSITIONS[from].includes(stage)) {
      throw conflict(`Invalid transition ${from} -> ${stage}`, 'application.invalidTransition');
    }
    // Seekers may only withdraw their own application.
    if (principal.role === 'job_seeker' && stage !== 'withdrawn') {
      throw forbidden('Seekers can only withdraw', 'error.forbidden');
    }
    const upd = await c.query<ApplicationRow>(
      `update applications set stage = $2 where id = $1
       returning id, job_id, candidate_id, stage, cover_note, created_at, updated_at`,
      [applicationId, stage],
    );
    if (!upd.rows.length) throw forbidden('Cannot update this application', 'error.forbidden');
    await c.query(
      `insert into application_stage_history (application_id, from_stage, to_stage, changed_by, note)
       values ($1, $2, $3, $4, $5)`,
      [applicationId, from, stage, principal.userId, note ?? null],
    );
    return upd.rows[0]!;
  });

  // Notify the candidate of a recruiter-driven change.
  if (principal.role === 'company_member') {
    const target = await deps.db.service((c) =>
      c.query<{ user_id: string }>(
        `select cd.user_id from applications a join candidates cd on cd.id = a.candidate_id where a.id = $1`,
        [applicationId],
      ),
    );
    const userId = target.rows[0]?.user_id;
    if (userId) {
      await notify(
        deps,
        userId,
        'application_status_changed',
        'Application update',
        `Stage: ${stage}`,
        `/applications`,
        {
          applicationId,
          stage,
        },
      );
    }
  }
  return mapApplication(result);
}

interface StageHistoryRow {
  id: string;
  application_id: string;
  from_stage: RecruitmentStage | null;
  to_stage: RecruitmentStage;
  changed_by: string;
  note: string | null;
  created_at: unknown;
}

export async function getStageHistory(
  deps: Deps,
  principal: Principal,
  applicationId: string,
): Promise<StageHistory[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<StageHistoryRow>(
      `select id, application_id, from_stage, to_stage, changed_by, note, created_at
       from application_stage_history where application_id = $1 order by created_at asc`,
      [applicationId],
    ),
  );
  return res.rows.map((r) => ({
    id: r.id,
    applicationId: r.application_id,
    fromStage: r.from_stage,
    toStage: r.to_stage,
    changedByUserId: r.changed_by,
    note: r.note,
    createdAt: toIso(r.created_at),
  }));
}

async function memberCompanyId(deps: Deps, userId: string, jobId?: string): Promise<string> {
  const res = await deps.db.service((c) =>
    jobId
      ? c.query<{ company_id: string }>(
          `select j.company_id from jobs j join company_members m on m.company_id = j.company_id
           where j.id = $1 and m.user_id = $2`,
          [jobId, userId],
        )
      : c.query<{ company_id: string }>(
          `select company_id from company_members where user_id = $1 order by created_at asc limit 1`,
          [userId],
        ),
  );
  const companyId = res.rows[0]?.company_id;
  if (!companyId) throw forbidden('No company membership', 'error.forbidden');
  return companyId;
}

export async function addShortlist(
  deps: Deps,
  principal: Principal,
  input: AddShortlistInput,
): Promise<ShortlistEntry> {
  const companyId = await memberCompanyId(deps, principal.userId, input.jobId);
  // Explicit upsert: ON CONFLICT cannot target the NULL-job case (NULLs are
  // distinct), so update-first, insert-otherwise; the partial unique index from
  // migration 0013 makes the insert race-safe (do nothing → re-read).
  const res = await deps.db.withContext(ctx(principal), async (c) => {
    const params = [
      companyId,
      input.candidateId,
      input.jobId ?? null,
      input.note ?? null,
      principal.userId,
    ];
    const upd = await c.query<{ id: string; created_at: unknown }>(
      `update shortlists set note = coalesce($4, note)
       where company_id = $1 and candidate_id = $2 and job_id is not distinct from $3
       returning id, created_at`,
      params.slice(0, 4),
    );
    if (upd.rows.length) return upd;
    const ins = await c.query<{ id: string; created_at: unknown }>(
      `insert into shortlists (company_id, candidate_id, job_id, note, created_by)
       values ($1, $2, $3, $4, $5)
       on conflict do nothing
       returning id, created_at`,
      params,
    );
    if (ins.rows.length) return ins;
    return c.query<{ id: string; created_at: unknown }>(
      `select id, created_at from shortlists
       where company_id = $1 and candidate_id = $2 and job_id is not distinct from $3`,
      params.slice(0, 3),
    );
  });
  return {
    id: res.rows[0]!.id,
    companyId,
    candidateId: input.candidateId,
    jobId: input.jobId ?? null,
    note: input.note ?? null,
    createdAt: toIso(res.rows[0]!.created_at),
  };
}

export async function listShortlist(deps: Deps, principal: Principal): Promise<ShortlistEntry[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<{
      id: string;
      company_id: string;
      candidate_id: string;
      job_id: string | null;
      note: string | null;
      created_at: unknown;
      candidate_name: string;
      candidate_headline: string | null;
    }>(
      `select s.id, s.company_id, s.candidate_id, s.job_id, s.note, s.created_at,
              p.display_name as candidate_name, cd.headline as candidate_headline
       from shortlists s join candidates cd on cd.id = s.candidate_id join profiles p on p.id = cd.user_id
       where s.company_id in (select company_id from company_members where user_id = $1)
       order by s.created_at desc`,
      [principal.userId],
    ),
  );
  return res.rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    candidateId: r.candidate_id,
    jobId: r.job_id,
    note: r.note,
    createdAt: toIso(r.created_at),
    candidateName: r.candidate_name,
    candidateHeadline: r.candidate_headline,
  }));
}

export async function removeShortlist(deps: Deps, principal: Principal, id: string): Promise<void> {
  await deps.db.withContext(ctx(principal), (c) =>
    c.query(`delete from shortlists where id = $1`, [id]),
  );
}

export async function compareCandidates(
  deps: Deps,
  principal: Principal,
  input: CompareRequestInput,
): Promise<ComparisonResult> {
  const companyId = await memberCompanyId(deps, principal.userId, input.jobId);
  if (input.jobId) await computeMatchesForJob(deps, input.jobId);
  const candidates = await deps.db.withContext(ctx(principal), async (c) => {
    const out: ComparisonCandidate[] = [];
    for (const candidateId of input.candidateIds) {
      const base = await c.query<{
        id: string;
        display_name: string;
        headline: string | null;
        years_experience: string | number;
      }>(
        `select cd.id, p.display_name, cd.headline, cd.years_experience
         from candidates cd join profiles p on p.id = cd.user_id where cd.id = $1`,
        [candidateId],
      );
      if (!base.rows.length) continue; // not readable to this company → omit (FR-10.5)
      const row = base.rows[0]!;
      const skillsRes = await c.query<{
        display_name: string;
        category: string | null;
        proficiency: ProficiencyLevel;
        years_experience: string | number;
        evidence_text: string | null;
      }>(
        `select s.display_name, s.category, cs.proficiency, cs.years_experience,
                array_to_string(cs.evidence, '||') as evidence_text
         from candidate_skills cs join skills s on s.id = cs.skill_id
         where cs.candidate_id = $1 order by cs.years_experience desc`,
        [candidateId],
      );
      const analysis = await c.query<{ summary: string }>(
        `select summary from skill_analyses where candidate_id = $1 order by generated_at desc limit 1`,
        [candidateId],
      );
      const match = input.jobId
        ? await c.query<{ score: number }>(
            `select score from match_results where job_id = $1 and candidate_id = $2`,
            [input.jobId, candidateId],
          )
        : { rows: [] as { score: number }[] };
      const skills = skillsRes.rows.map((s) => ({
        name: s.display_name,
        category: s.category,
        proficiency: s.proficiency,
        yearsExperience: Number(s.years_experience),
        evidence: s.evidence_text ? s.evidence_text.split('||').filter(Boolean) : [],
      }));
      out.push({
        candidateId,
        displayName: row.display_name,
        headline: row.headline,
        yearsExperience: Number(row.years_experience),
        matchScore: match.rows[0] ? Number(match.rows[0].score) : null,
        summary: analysis.rows[0]?.summary ?? null,
        skills,
        keyEvidence: skills.flatMap((s) => s.evidence).slice(0, 6),
      });
    }
    return out;
  });

  await deps.db.withContext(ctx(principal), (c) =>
    c.query(
      `insert into candidate_comparisons (company_id, job_id, candidate_ids, created_by)
       values ($1, $2, $3::uuid[], $4)`,
      [
        companyId,
        input.jobId ?? null,
        pgArrayLiteral(candidates.map((x) => x.candidateId)),
        principal.userId,
      ],
    ),
  );

  return { jobId: input.jobId ?? null, candidates };
}

interface InterviewRow {
  id: string;
  application_id: string;
  proposed_by: string;
  scheduled_at: unknown;
  duration_minutes: number;
  mode: InterviewMode;
  location: string | null;
  notes: string | null;
  status: InterviewStatus;
  created_at: unknown;
  updated_at: unknown;
}

function mapInterview(r: InterviewRow): Interview {
  return {
    id: r.id,
    applicationId: r.application_id,
    proposedByUserId: r.proposed_by,
    scheduledAt: toIso(r.scheduled_at),
    durationMinutes: Number(r.duration_minutes),
    mode: r.mode,
    location: r.location,
    notes: r.notes,
    status: r.status,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

export async function proposeInterview(
  deps: Deps,
  principal: Principal,
  applicationId: string,
  input: ProposeInterviewInput,
): Promise<Interview> {
  const interview = await deps.db.withContext(ctx(principal), async (c) => {
    const res = await c.query<InterviewRow>(
      `insert into interviews (application_id, proposed_by, scheduled_at, duration_minutes, mode, location, notes)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, application_id, proposed_by, scheduled_at, duration_minutes, mode, location, notes, status, created_at, updated_at`,
      [
        applicationId,
        principal.userId,
        input.scheduledAt,
        input.durationMinutes,
        input.mode,
        input.location ?? null,
        input.notes ?? null,
      ],
    );
    if (!res.rows.length) throw forbidden('Cannot propose interview', 'error.forbidden');
    return res.rows[0]!;
  });

  const target = await deps.db.service((c) =>
    c.query<{ user_id: string }>(
      `select cd.user_id from applications a join candidates cd on cd.id = a.candidate_id where a.id = $1`,
      [applicationId],
    ),
  );
  if (target.rows[0]) {
    await notify(
      deps,
      target.rows[0].user_id,
      'interview_proposed',
      'Interview proposed',
      input.mode,
      `/applications`,
      {
        applicationId,
        interviewId: interview.id,
      },
    );
  }
  return mapInterview(interview);
}

export async function respondInterview(
  deps: Deps,
  principal: Principal,
  interviewId: string,
  input: RespondInterviewInput,
): Promise<Interview> {
  const interview = await deps.db.withContext(ctx(principal), async (c) => {
    // Only the candidate of the interview's application may confirm/decline.
    const owns = await c.query<{ ok: boolean; application_id: string }>(
      `select (cd.user_id = $2) as ok, a.id as application_id
       from interviews i join applications a on a.id = i.application_id
       join candidates cd on cd.id = a.candidate_id
       where i.id = $1`,
      [interviewId, principal.userId],
    );
    if (!owns.rows.length) throw notFound('Interview not found', 'interview.notFound');
    if (!owns.rows[0]!.ok) throw forbidden('Only the candidate can respond', 'error.forbidden');
    const res = await c.query<InterviewRow>(
      `update interviews set status = $2 where id = $1
       returning id, application_id, proposed_by, scheduled_at, duration_minutes, mode, location, notes, status, created_at, updated_at`,
      [interviewId, input.response],
    );
    return res.rows[0]!;
  });

  await notify(
    deps,
    interview.proposed_by,
    'interview_updated',
    'Interview response',
    input.response,
    `/console`,
    {
      interviewId,
      status: input.response,
    },
  );
  return mapInterview(interview);
}

export async function listInterviews(
  deps: Deps,
  principal: Principal,
  applicationId: string,
): Promise<Interview[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<InterviewRow>(
      `select id, application_id, proposed_by, scheduled_at, duration_minutes, mode, location, notes, status, created_at, updated_at
       from interviews where application_id = $1 order by scheduled_at asc`,
      [applicationId],
    ),
  );
  return res.rows.map(mapInterview);
}
