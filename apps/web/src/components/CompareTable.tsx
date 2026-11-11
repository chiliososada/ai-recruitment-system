import type { ComparisonResult } from '@ars/shared';
import { useTranslation } from 'react-i18next';

export function CompareTable({ result }: { result: ComparisonResult }): JSX.Element {
  const { t } = useTranslation();
  // Scores only exist when the comparison is against one job; otherwise drop the row.
  const hasScores = result.candidates.some((c) => c.matchScore != null);
  return (
    <div className="card" data-testid="compare-table" style={{ overflowX: 'auto' }}>
      <h2>{t('compare.title')}</h2>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">{t('compare.item')}</th>
            {result.candidates.map((c) => (
              <th key={c.candidateId} scope="col">
                {c.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasScores ? (
            <tr>
              <th scope="row">{t('compare.matchScore')}</th>
              {result.candidates.map((c) => (
                <td key={c.candidateId} className="score">
                  {c.matchScore ?? '—'}
                </td>
              ))}
            </tr>
          ) : null}
          <tr>
            <th scope="row">{t('compare.years')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId}>{t('analysis.years', { count: c.yearsExperience })}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">{t('compare.skills')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId}>
                {c.skills.slice(0, 8).map((s) => (
                  <span key={s.name} className="tag">
                    {s.name}
                  </span>
                ))}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">{t('compare.summary')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId} className="muted">
                {c.summary ?? '—'}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">{t('compare.evidence')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId} className="muted">
                {c.keyEvidence.slice(0, 3).join(' · ') || '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
