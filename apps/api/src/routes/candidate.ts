import type { FastifyInstance } from 'fastify';
import { GenerateAnalysisSchema, UpdateCandidateProfileSchema } from '@ars/shared';
import type { Deps } from '../deps.js';
import { badRequest, notFound, parseOrThrow } from '../errors.js';
import { requireAuth, requireRole } from '../http/context.js';
import {
  generateAndStoreAnalysis,
  getLatestAnalysis,
  getLatestResumeText,
} from '../services/analysis.js';
import {
  getCandidateIdForUser,
  getMyProfile,
  getUserLocale,
  updateMyProfile,
} from '../services/candidate.js';
import {
  downloadResume,
  getParseJob,
  listResumes,
  retryParse,
  uploadResume,
} from '../services/resume.js';

export function registerCandidateRoutes(app: FastifyInstance, deps: Deps): void {
  // Stricter per-route limit on the expensive upload+parse pipeline (BE-3). Test default stays
  // high so existing suites are unaffected.
  const uploadLimit = {
    rateLimit: { max: deps.config.NODE_ENV === 'test' ? 100000 : 10, timeWindow: '1 minute' },
  };

  app.get('/candidates/me', async (req) => getMyProfile(deps, requireRole(req, 'job_seeker')));

  app.patch('/candidates/me', async (req) =>
    updateMyProfile(
      deps,
      requireRole(req, 'job_seeker'),
      parseOrThrow(UpdateCandidateProfileSchema, req.body),
    ),
  );

  app.post('/candidates/me/resume', { config: uploadLimit }, async (req, reply) => {
    const principal = requireRole(req, 'job_seeker');
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded', 'resume.upload.empty');
    const buffer = await file.toBuffer();
    const result = await uploadResume(deps, principal, {
      filename: file.filename,
      mime: file.mimetype,
      buffer,
    });
    return reply.code(201).send(result);
  });

  app.get('/candidates/me/resumes', async (req) =>
    listResumes(deps, requireRole(req, 'job_seeker')),
  );

  app.get<{ Params: { id: string } }>('/candidates/me/parse-jobs/:id', async (req) =>
    getParseJob(deps, requireRole(req, 'job_seeker'), req.params.id),
  );

  app.post<{ Params: { id: string } }>('/candidates/me/parse-jobs/:id/retry', async (req) =>
    retryParse(deps, requireRole(req, 'job_seeker'), req.params.id),
  );

  app.get('/candidates/me/analysis', async (req) => {
    const principal = requireRole(req, 'job_seeker');
    const candidateId = await getCandidateIdForUser(deps, principal.userId);
    const analysis = await getLatestAnalysis(deps, candidateId, {
      role: 'authenticated',
      userId: principal.userId,
      email: principal.email,
    });
    if (!analysis) throw notFound('No analysis yet', 'analysis.none');
    return analysis;
  });

  app.post('/candidates/me/analysis', async (req) => {
    const principal = requireRole(req, 'job_seeker');
    const { locale } = parseOrThrow(GenerateAnalysisSchema, req.body ?? {});
    const candidateId = await getCandidateIdForUser(deps, principal.userId);
    const text = await getLatestResumeText(deps, candidateId);
    const effectiveLocale = locale ?? (await getUserLocale(deps, principal.userId));
    return generateAndStoreAnalysis(deps, candidateId, text ?? '', effectiveLocale);
  });

  app.get<{ Params: { id: string } }>('/resumes/:id/download', async (req, reply) => {
    const principal = requireAuth(req);
    const file = await downloadResume(deps, principal, req.params.id);
    reply.header('content-type', file.mime);
    reply.header('content-disposition', `attachment; filename="${file.filename}"`);
    return reply.send(file.buffer);
  });
}
