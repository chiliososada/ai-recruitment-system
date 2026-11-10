import type { MatchResult } from '@ars/shared';
import { useTranslation } from 'react-i18next';
import { prettySkill } from '../lib/format';

/**
 * Localised explanation of a fit score: the sub-score breakdown plus matched / missing
 * skills. Replaces the API's English `reason` string, which is only a debugging skeleton.
 */
export function MatchExplanation({
  match,
  knownSkills = [],
  maxMatched = 6,
  maxMissing = 4,
}: {
  match: Pick<MatchResult, 'breakdown' | 'matchedSkills' | 'missingSkills'>;
  /** Skill names in their original casing (e.g. the job's own list). */
  knownSkills?: readonly string[];
  maxMatched?: number;
  maxMissing?: number;
}): JSX.Element {
  const { t } = useTranslation();
  const pct = (n: number): number => Math.round(n * 100);
  const b = match.breakdown;
  const matched = match.matchedSkills.slice(0, maxMatched);
  const missing = match.missingSkills.slice(0, maxMissing);
  const label = { fontSize: 'var(--text-sm)', marginRight: 'var(--space-2)' } as const;
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }} data-testid="match-explanation">
      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        {t('match.breakdown', {
          skill: pct(b.skillScore),
          exp: pct(b.experienceScore),
          sim: pct(b.vectorSimilarity),
        })}
      </p>
      {matched.length > 0 ? (
        <div>
          <span className="muted" style={label}>
            {t('match.matched')}
          </span>
          {matched.map((s) => (
            <span key={s} className="tag ok">
              {prettySkill(s, knownSkills)}
            </span>
          ))}
        </div>
      ) : null}
      {missing.length > 0 ? (
        <div>
          <span className="muted" style={label}>
            {t('match.missing')}
          </span>
          {missing.map((s) => (
            <span key={s} className="tag gap">
              {prettySkill(s, knownSkills)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
