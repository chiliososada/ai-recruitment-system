import type { MatchResult } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, EmptyState, ErrorState, Loading } from '../components/ui';

export default function Recommendations(): JSX.Element {
  const { t } = useTranslation();
  const recs = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api.get<MatchResult[]>('/candidates/me/recommendations'),
  });

  if (recs.isLoading) return <Loading />;
  if (recs.error) return <ErrorState error={recs.error} onRetry={() => recs.refetch()} />;
  const items = recs.data ?? [];

  return (
    <section className="stack">
      <h1>{t('match.recommendations.title')}</h1>
      {items.length === 0 ? (
        <EmptyState message={t('match.recommendations.empty')} />
      ) : (
        <div className="grid cols-2">
          {items.map((m) => (
            <article key={m.id} className="card stack" data-testid="rec-card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>
                  <Link to={`/jobs/${m.jobId}`}>{m.jobTitle}</Link>
                </h2>
                <span className="score" aria-label={t('match.score')}>
                  {m.score}
                </span>
              </div>
              <p className="muted">{m.companyName}</p>
              <p>{m.reason}</p>
              <div>
                {m.matchedSkills.slice(0, 6).map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
              {m.missingSkills.length > 0 && (
                <p className="muted">
                  {t('match.missing')}: {m.missingSkills.slice(0, 5).join(', ')}
                </p>
              )}
              <Badge>{t('match.score')}: {m.score}/100</Badge>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
