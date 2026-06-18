import { createHash } from 'node:crypto';
import { ALGORITHM_VERSION } from '@ars/shared';
import type { Deps } from '../deps.js';
import { vectorLiteral } from '../util.js';

function sourceHash(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

const PROFICIENCY_REPEAT: Record<string, number> = {
  expert: 3,
  advanced: 2,
  intermediate: 1,
  beginner: 1,
};

interface CandidateComposeRow {
  headline: string | null;
  summary: string | null;
  languages_text: string | null;
}

/**
 * (Re)generate a candidate's embedding from their profile + skills + latest analysis
 * summary (FR-05.4). Skips work when the source text is unchanged (source_hash). Runs as
 * service (trusted derived write) after the caller has authorized the candidate.
 */
export async function regenerateCandidateEmbedding(deps: Deps, candidateId: string): Promise<void> {
  const text = await deps.db.service(async (c) => {
    const cand = await c.query<CandidateComposeRow>(
      `select headline, summary, array_to_string(languages, ' ') as languages_text
       from candidates where id = $1`,
      [candidateId],
    );
    const skills = await c.query<{ display_name: string; proficiency: string }>(
      `select s.display_name, cs.proficiency
       from candidate_skills cs join skills s on s.id = cs.skill_id
       where cs.candidate_id = $1`,
      [candidateId],
    );
    const analysis = await c.query<{ summary: string }>(
      `select summary from skill_analyses where candidate_id = $1 order by generated_at desc limit 1`,
      [candidateId],
    );
    const row = cand.rows[0];
    const parts: string[] = [
      row?.headline ?? '',
      row?.summary ?? '',
      analysis.rows[0]?.summary ?? '',
      row?.languages_text ?? '',
    ];
    for (const sk of skills.rows) {
      const reps = PROFICIENCY_REPEAT[sk.proficiency] ?? 1;
      for (let i = 0; i < reps; i++) parts.push(sk.display_name);
    }
    return parts.filter(Boolean).join(' ').trim();
  });

  await upsertEmbedding(
    deps,
    'candidate_embeddings',
    'candidate_id',
    candidateId,
    text || 'candidate',
  );
}

interface JobComposeRow {
  title: string;
  category: string;
  description: string;
}

/** (Re)generate a job's embedding from its content + skills (FR-05.4). */
export async function regenerateJobEmbedding(deps: Deps, jobId: string): Promise<void> {
  const text = await deps.db.service(async (c) => {
    const job = await c.query<JobComposeRow>(
      `select title, category, description from jobs where id = $1`,
      [jobId],
    );
    const skills = await c.query<{ display_name: string; required: boolean }>(
      `select display_name, required from job_skills where job_id = $1`,
      [jobId],
    );
    const row = job.rows[0];
    if (!row) return '';
    const parts: string[] = [row.title, row.category, row.description];
    for (const sk of skills.rows) {
      parts.push(sk.display_name);
      if (sk.required) parts.push(sk.display_name);
    }
    return parts.filter(Boolean).join(' ').trim();
  });
  if (!text) return;
  await upsertEmbedding(deps, 'job_embeddings', 'job_id', jobId, text);
}

async function upsertEmbedding(
  deps: Deps,
  table: 'candidate_embeddings' | 'job_embeddings',
  keyCol: 'candidate_id' | 'job_id',
  id: string,
  text: string,
): Promise<void> {
  const src = sourceHash(text);
  const existing = await deps.db.service((c) =>
    c.query<{ source_hash: string }>(`select source_hash from ${table} where ${keyCol} = $1`, [id]),
  );
  if (existing.rows[0]?.source_hash === src) return;
  const vec = await deps.embeddings.embed(text);
  await deps.db.service((c) =>
    c.query(
      `insert into ${table} (${keyCol}, embedding, algorithm_version, source_hash, updated_at)
       values ($1, $2::vector, $3, $4, now())
       on conflict (${keyCol}) do update
         set embedding = excluded.embedding,
             algorithm_version = excluded.algorithm_version,
             source_hash = excluded.source_hash,
             updated_at = now()`,
      [id, vectorLiteral(vec), ALGORITHM_VERSION, src],
    ),
  );
}
