import type { MatchResult } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { Icons, InitialAvatar, ScoreRing } from '../design';

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
      <div className="page-header">
        <h1>{t('match.recommendations.title')}</h1>
      </div>
      {items.length === 0 ? (
        <EmptyState message={t('match.recommendations.empty')} />
      ) : (
        <div className="grid cols-2">
          {items.map((m) => (
            <article key={m.id} className="card" data-testid="rec-card">
              <div
                className="row"
                style={{ gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
              >
                <InitialAvatar name={m.companyName ?? m.jobTitle ?? '?'} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
                    <Link to={`/jobs/${m.jobId}`}>{m.jobTitle}</Link>
                  </h2>
                  <div className="meta-row" style={{ marginTop: 4 }}>
                    <span className="meta-item">
                      <Icons.Building2 size={14} aria-hidden="true" />
                      {m.companyName}
                    </span>
                  </div>
                </div>
                <span aria-label={`${t('match.score')} ${m.score}/100`}>
                  <ScoreRing value={m.score} size={52} />
                </span>
              </div>
              <p className="muted" style={{ margin: 'var(--space-3) 0' }}>
                {m.reason}
              </p>
              <div>
                {m.matchedSkills.slice(0, 6).map((s) => (
                  <span key={s} className="tag ok">
                    {s}
                  </span>
                ))}
                {m.missingSkills.slice(0, 4).map((s) => (
                  <span key={s} className="tag gap">
                    {s}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
