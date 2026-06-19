import { randomUUID } from 'node:crypto';
import {
  sanitizeFilename,
  validateUpload,
  type Locale,
  type ParseJob,
  type ParseStatus,
  type ResumeFile,
  type ScanResult,
  type UploadResult,
} from '@ars/shared';
import { extractResumeText } from '../adapters/extract.js';
import type { Deps } from '../deps.js';
import type { RequestContext } from '../db/types.js';
import {
  AppError,
  badRequest,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMedia,
  virusDetected,
} from '../errors.js';
import type { Principal } from '../http/context.js';
import { toIso } from '../util.js';
import { generateAndStoreAnalysis } from './analysis.js';
import { getCandidateIdForUser } from './candidate.js';

export interface UploadFile {
  filename: string;
  mime: string;
  buffer: Buffer;
}

interface ResumeRow {
  id: string;
  candidate_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  scan_result: ScanResult;
  created_at: unknown;
}

interface ParseRow {
  id: string;
  resume_file_id: string;
  candidate_id: string;
  status: ParseStatus;
  attempts: number;
  error: string | null;
  created_at: unknown;
  updated_at: unknown;
}

const ctx = (p: Principal): RequestContext => ({
  role: 'authenticated',
  userId: p.userId,
  email: p.email,
});

function mapResume(r: ResumeRow): ResumeFile {
  return {
    id: r.id,
    candidateId: r.candidate_id,
    filename: r.filename,
    mime: r.mime,
    sizeBytes: Number(r.size_bytes),
    scanResult: r.scan_result,
    createdAt: toIso(r.created_at),
  };
}

function mapParse(r: ParseRow): ParseJob {
  return {
    id: r.id,
    resumeFileId: r.resume_file_id,
    candidateId: r.candidate_id,
    status: r.status,
    attempts: Number(r.attempts),
    error: r.error,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
  return lower.slice(lower.lastIndexOf('.'));
}

/** Magic-byte check: PDF starts with `%PDF-`; DOCX is a ZIP (`PK\x03\x04` local file header). */
function contentMatchesExtension(buffer: Buffer, filename: string): boolean {
  const ext = extensionOf(filename);
  if (buffer.length < 4) return false;
  if (ext === '.pdf') return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (ext === '.docx') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  return false;
}

export async function uploadResume(
  deps: Deps,
  principal: Principal,
  file: UploadFile,
): Promise<UploadResult> {
  const candidateId = await getCandidateIdForUser(deps, principal.userId);

  // Server-side validation (FR-02.3) — mirrors the shared client validation.
  const failure = validateUpload({
    filename: file.filename,
    mime: file.mime,
    sizeBytes: file.buffer.length,
  });
  if (failure === 'resume.upload.empty') throw badRequest('Empty file', failure);
  if (failure === 'resume.upload.tooLarge') throw payloadTooLarge('File too large', failure);
  if (failure === 'resume.upload.badExtension') throw unsupportedMedia('Bad extension', failure);
  if (failure === 'resume.upload.badMime') throw unsupportedMedia('Bad MIME type', failure);

  // Virus scan (FR-02.4) first. Fail-closed: a scanner error rejects the upload.
  const verdict = await deps.scanner.scan(file.buffer, file.filename);
  if (verdict === 'infected') throw virusDetected();
  if (verdict === 'error') throw new AppError('INTERNAL', 'Virus scan failed', 'resume.scan.error');

  // Content sniffing (SEC-2): the actual bytes must match the declared type — defeats MIME /
  // extension spoofing of clean files (e.g. an executable renamed to .pdf).
  if (!contentMatchesExtension(file.buffer, file.filename)) {
    throw unsupportedMedia('File content does not match its type', 'resume.upload.badContent');
  }

  // Unguessable, owner-scoped storage path (never derived from the filename).
  const storagePath = `${principal.userId}/${randomUUID()}${extensionOf(file.filename)}`;
  await deps.storage.put(storagePath, file.buffer, file.mime, principal.userId);

  const { resume, parseJob } = await deps.db.service(async (c) => {
    const r = await c.query<ResumeRow>(
      `insert into resume_files (candidate_id, filename, mime, size_bytes, storage_path, scan_result)
       values ($1, $2, $3, $4, $5, $6)
       returning id, candidate_id, filename, mime, size_bytes, scan_result, created_at`,
      [
        candidateId,
        sanitizeFilename(file.filename),
        file.mime,
        file.buffer.length,
        storagePath,
        verdict,
      ],
    );
    const pj = await c.query<ParseRow>(
      `insert into parse_jobs (resume_file_id, candidate_id, status)
       values ($1, $2, 'pending')
       returning id, resume_file_id, candidate_id, status, attempts, error, created_at, updated_at`,
      [r.rows[0]!.id, candidateId],
    );
    return { resume: r.rows[0]!, parseJob: pj.rows[0]! };
  });

  // Enqueue durable parse job (idempotent on the parse-job id). In inline mode (dev/test) it is
  // drained synchronously so the response reflects the final status; in async/prod the worker
  // processes it and the client polls parse-job status (FR-02 semantics preserved — ID-2/ID-3).
  await deps.jobs.enqueue(
    'resume_parse',
    { parseJobId: parseJob.id },
    { idempotencyKey: parseJob.id },
  );
  if (deps.jobs.inline) await deps.jobs.drainInline();
  const finalParse = (await fetchParseRow(deps, parseJob.id)) ?? parseJob;
  return { resume: mapResume(resume), parseJob: mapParse(finalParse) };
}

async function fetchParseRow(deps: Deps, parseJobId: string): Promise<ParseRow | null> {
  const res = await deps.db.service((c) =>
    c.query<ParseRow>(
      `select id, resume_file_id, candidate_id, status, attempts, error, created_at, updated_at
       from parse_jobs where id = $1`,
      [parseJobId],
    ),
  );
  return res.rows[0] ?? null;
}

/** Run extraction + AI analysis for a parse job, persisting status transitions. */
export async function runParse(deps: Deps, parseJobId: string): Promise<ParseRow> {
  const setStatus = (status: ParseStatus, error: string | null, bumpAttempt: boolean) =>
    deps.db.service((c) =>
      c.query<ParseRow>(
        `update parse_jobs
           set status = $2, error = $3, attempts = attempts + $4, updated_at = now()
         where id = $1
         returning id, resume_file_id, candidate_id, status, attempts, error, created_at, updated_at`,
        [parseJobId, status, error, bumpAttempt ? 1 : 0],
      ),
    );

  await setStatus('processing', null, true);

  try {
    const job = await deps.db.service((c) =>
      c.query<{
        candidate_id: string;
        storage_path: string;
        mime: string;
        resume_file_id: string;
        locale: Locale;
      }>(
        `select pj.candidate_id, rf.storage_path, rf.mime, pj.resume_file_id, p.locale
         from parse_jobs pj
         join resume_files rf on rf.id = pj.resume_file_id
         join candidates c on c.id = pj.candidate_id
         join profiles p on p.id = c.user_id
         where pj.id = $1`,
        [parseJobId],
      ),
    );
    const row = job.rows[0];
    if (!row) throw notFound('Parse job not found', 'error.notFound');

    const bytes = await deps.storage.get(row.storage_path);
    const text = await extractResumeText(bytes, row.mime);
    if (!text || text.trim().length < 5) {
      const failed = await setStatus('failed', 'resume.parse.empty', false);
      return failed.rows[0]!;
    }

    await deps.db.service((c) =>
      c.query(`update resume_files set extracted_text = $2 where id = $1`, [
        row.resume_file_id,
        text,
      ]),
    );

    await generateAndStoreAnalysis(deps, row.candidate_id, text, row.locale);

    const ok = await setStatus('succeeded', null, false);
    return ok.rows[0]!;
  } catch (err) {
    const key = err instanceof AppError && err.messageKey ? err.messageKey : 'resume.parse.failed';
    deps.log.warn(
      { parseJobId, code: err instanceof AppError ? err.code : 'unknown' },
      'parse pipeline failed',
    );
    const failed = await setStatus('failed', key, false);
    return failed.rows[0]!;
  }
}

export async function listResumes(deps: Deps, principal: Principal): Promise<ResumeFile[]> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<ResumeRow>(
      `select rf.id, rf.candidate_id, rf.filename, rf.mime, rf.size_bytes, rf.scan_result, rf.created_at
       from resume_files rf join candidates c on c.id = rf.candidate_id
       where c.user_id = $1 order by rf.created_at desc`,
      [principal.userId],
    ),
  );
  return res.rows.map(mapResume);
}

export async function getParseJob(
  deps: Deps,
  principal: Principal,
  parseJobId: string,
): Promise<ParseJob> {
  const res = await deps.db.withContext(ctx(principal), (c) =>
    c.query<ParseRow>(
      `select id, resume_file_id, candidate_id, status, attempts, error, created_at, updated_at
       from parse_jobs where id = $1`,
      [parseJobId],
    ),
  );
  if (!res.rows.length) throw notFound('Parse job not found', 'error.notFound');
  return mapParse(res.rows[0]!);
}

export async function retryParse(
  deps: Deps,
  principal: Principal,
  parseJobId: string,
): Promise<ParseJob> {
  // Authorize ownership through RLS before re-enqueueing (worker runs as service).
  const owned = await deps.db.withContext(ctx(principal), (c) =>
    c.query(`select 1 from parse_jobs where id = $1`, [parseJobId]),
  );
  if (!owned.rows.length) throw notFound('Parse job not found', 'error.notFound');
  await deps.jobs.enqueue(
    'resume_parse',
    { parseJobId },
    { idempotencyKey: `${parseJobId}:retry:${randomUUID()}` },
  );
  if (deps.jobs.inline) await deps.jobs.drainInline();
  const refreshed = await fetchParseRow(deps, parseJobId);
  return mapParse(refreshed ?? (await requireParseRow(deps, parseJobId)));
}

async function requireParseRow(deps: Deps, parseJobId: string): Promise<ParseRow> {
  const row = await fetchParseRow(deps, parseJobId);
  if (!row) throw notFound('Parse job not found', 'error.notFound');
  return row;
}

export interface ResumeDownload {
  buffer: Buffer;
  filename: string;
  mime: string;
}

export async function companyCanAccessCandidate(
  deps: Deps,
  userId: string,
  candidateId: string,
): Promise<boolean> {
  const res = await deps.db.service((c) =>
    c.query<{ ok: boolean }>(
      `select (
         exists(select 1 from applications a join jobs j on j.id = a.job_id
                join company_members m on m.company_id = j.company_id
                where a.candidate_id = $1 and m.user_id = $2)
         or exists(select 1 from shortlists s join company_members m on m.company_id = s.company_id
                where s.candidate_id = $1 and m.user_id = $2)
       ) as ok`,
      [candidateId, userId],
    ),
  );
  return Boolean(res.rows[0]?.ok);
}

/** Download a resume: owner always; companies only when linked via application/shortlist (FR-06.3). */
export async function downloadResume(
  deps: Deps,
  principal: Principal,
  resumeFileId: string,
): Promise<ResumeDownload> {
  const res = await deps.db.service((c) =>
    c.query<{
      storage_path: string;
      filename: string;
      mime: string;
      candidate_id: string;
      user_id: string;
    }>(
      `select rf.storage_path, rf.filename, rf.mime, rf.candidate_id, c.user_id
       from resume_files rf join candidates c on c.id = rf.candidate_id
       where rf.id = $1`,
      [resumeFileId],
    ),
  );
  const row = res.rows[0];
  if (!row) throw notFound('Resume not found', 'resume.file.missing');

  const isOwner = row.user_id === principal.userId;
  const authorized =
    isOwner ||
    (principal.role === 'company_member' &&
      (await companyCanAccessCandidate(deps, principal.userId, row.candidate_id)));
  if (!authorized) throw forbidden('Not allowed to download this resume', 'error.forbidden');

  const buffer = await deps.storage.get(row.storage_path);
  return { buffer, filename: row.filename, mime: row.mime };
}
