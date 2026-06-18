import {
  SkillAnalysisResultSchema,
  type Locale,
  type SkillAnalysis,
  type SkillAnalysisResult,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import { notFound, upstreamAiError } from '../errors.js';
import { toIso } from '../util.js';
import { regenerateCandidateEmbedding } from './embeddings.js';
import { replaceCandidateSkills } from './skills.js';

const MAX_ATTEMPTS = 3;

/**
 * Call the LLM and validate its output against the schema, retrying on
 * failure/timeout/invalid response (FR-03.2). The resume text is never logged (FR-03.5).
 */
export async function runAnalysis(
  deps: Deps,
  resumeText: string,
  locale: Locale,
): Promise<SkillAnalysisResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await deps.llm.analyzeResume({ resumeText, locale });
      const parsed = SkillAnalysisResultSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
      lastError = new Error('schema validation failed');
      deps.log.warn({ attempt, provider: deps.llm.providerName }, 'AI analysis schema invalid; retrying');
    } catch (err) {
      lastError = err;
      deps.log.warn({ attempt, provider: deps.llm.providerName }, 'AI analysis call failed; retrying');
    }
  }
  throw upstreamAiError(
    `AI analysis failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : 'unknown'
    }`,
  );
}

/** Generate + persist analysis, candidate skills, years, and refresh the embedding. */
export async function generateAndStoreAnalysis(
  deps: Deps,
  candidateId: string,
  resumeText: string,
  locale: Locale,
): Promise<SkillAnalysis> {
  const result = await runAnalysis(deps, resumeText, locale);

  const stored = await deps.db.service(async (c) => {
    const ins = await c.query<{ id: string; generated_at: unknown }>(
      `insert into skill_analyses
        (candidate_id, summary, total_years_experience, result, locale, model_provider, model_version, prompt_version)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
       returning id, generated_at`,
      [
        candidateId,
        result.summary,
        result.totalYearsExperience,
        JSON.stringify(result),
        locale,
        deps.llm.providerName,
        deps.llm.modelVersion,
        deps.llm.promptVersion,
      ],
    );
    await replaceCandidateSkills(
      c,
      candidateId,
      result.skills.map((s) => ({
        name: s.name,
        category: s.category,
        proficiency: s.proficiency,
        yearsExperience: s.yearsExperience,
        evidence: s.evidence,
      })),
    );
    await c.query(`update candidates set years_experience = $2 where id = $1`, [
      candidateId,
      result.totalYearsExperience,
    ]);
    return ins.rows[0]!;
  });

  await regenerateCandidateEmbedding(deps, candidateId);

  return {
    ...result,
    id: stored.id,
    candidateId,
    modelProvider: deps.llm.providerName,
    modelVersion: deps.llm.modelVersion,
    promptVersion: deps.llm.promptVersion,
    generatedAt: toIso(stored.generated_at),
  };
}

interface AnalysisRow {
  id: string;
  candidate_id: string;
  result: unknown;
  locale: Locale;
  model_provider: string;
  model_version: string;
  prompt_version: string;
  generated_at: unknown;
}

/** Latest persisted analysis for a candidate, or null. Caller authorizes via RLS context. */
export async function getLatestAnalysis(
  deps: Deps,
  candidateId: string,
  ctx: { role: 'authenticated' | 'service'; userId?: string | null; email?: string | null },
): Promise<SkillAnalysis | null> {
  const res = await deps.db.withContext(ctx, (c) =>
    c.query<AnalysisRow>(
      `select id, candidate_id, result, locale, model_provider, model_version, prompt_version, generated_at
       from skill_analyses where candidate_id = $1 order by generated_at desc limit 1`,
      [candidateId],
    ),
  );
  const row = res.rows[0];
  if (!row) return null;
  const result = SkillAnalysisResultSchema.parse(row.result);
  return {
    ...result,
    id: row.id,
    candidateId: row.candidate_id,
    modelProvider: row.model_provider,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    generatedAt: toIso(row.generated_at),
  };
}

export async function getLatestResumeText(deps: Deps, candidateId: string): Promise<string | null> {
  const res = await deps.db.service((c) =>
    c.query<{ extracted_text: string | null }>(
      `select extracted_text from resume_files
       where candidate_id = $1 and extracted_text is not null
       order by created_at desc limit 1`,
      [candidateId],
    ),
  );
  if (!res.rows.length) {
    throw notFound('No parsed resume available', 'resume.none');
  }
  return res.rows[0]!.extracted_text;
}
