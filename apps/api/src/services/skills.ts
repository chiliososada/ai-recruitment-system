import { normalizeSkill, type ProficiencyLevel } from '@ars/shared';
import type { DbClient } from '../db/types.js';
import { pgArrayLiteral } from '../util.js';

/** Insert-or-update a skill in the canonical dictionary, returning its id. */
export async function upsertSkill(
  c: DbClient,
  display: string,
  category: string | null,
): Promise<string> {
  const name = normalizeSkill(display);
  const res = await c.query<{ id: string }>(
    `insert into skills (name, display_name, category)
     values ($1, $2, $3)
     on conflict (name) do update set display_name = excluded.display_name,
       category = coalesce(excluded.category, skills.category)
     returning id`,
    [name, display, category],
  );
  return res.rows[0]!.id;
}

export interface CandidateSkillInput {
  name: string;
  category: string | null;
  proficiency: ProficiencyLevel;
  yearsExperience: number;
  evidence: string[];
}

/** Replace a candidate's derived skill set atomically (within the caller's transaction). */
export async function replaceCandidateSkills(
  c: DbClient,
  candidateId: string,
  skills: CandidateSkillInput[],
): Promise<void> {
  await c.query(`delete from candidate_skills where candidate_id = $1`, [candidateId]);
  for (const s of skills) {
    const skillId = await upsertSkill(c, s.name, s.category);
    await c.query(
      `insert into candidate_skills (candidate_id, skill_id, proficiency, years_experience, evidence)
       values ($1, $2, $3, $4, $5::text[])
       on conflict (candidate_id, skill_id) do update
         set proficiency = excluded.proficiency,
             years_experience = excluded.years_experience,
             evidence = excluded.evidence`,
      [candidateId, skillId, s.proficiency, s.yearsExperience, pgArrayLiteral(s.evidence)],
    );
  }
}
