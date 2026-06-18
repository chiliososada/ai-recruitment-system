import type { ComparisonResult } from '@ars/shared';
import { useTranslation } from 'react-i18next';

export function CompareTable({ result }: { result: ComparisonResult }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="card" data-testid="compare-table" style={{ overflowX: 'auto' }}>
      <h2>{t('compare.title')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('compare.summary')}</th>
            {result.candidates.map((c) => (
              <th key={c.candidateId}>{c.displayName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>{t('compare.matchScore')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId} className="score">
                {c.matchScore ?? '—'}
              </td>
            ))}
          </tr>
          <tr>
            <th>{t('compare.years')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId}>{c.yearsExperience}</td>
            ))}
          </tr>
          <tr>
            <th>{t('compare.skills')}</th>
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
            <th>{t('compare.summary')}</th>
            {result.candidates.map((c) => (
              <td key={c.candidateId} className="muted">
                {c.summary ?? '—'}
              </td>
            ))}
          </tr>
          <tr>
            <th>{t('compare.evidence')}</th>
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
