import type { CandidateDetail as CandidateDetailDto, Conversation } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { localizeError } from '../lib/errors';
import { ErrorState, Loading } from '../components/ui';
import { Icons, InitialAvatar } from '../design';

export default function CandidateDetail(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get<CandidateDetailDto>(`/talent/${id}`),
  });

  const message = useMutation({
    mutationFn: (participantUserId: string) =>
      api.post<Conversation>('/conversations', { participantUserId }),
    onSuccess: (c) => navigate(`/messages?c=${c.id}`),
  });

  const shortlist = useMutation({
    mutationFn: () => api.post('/shortlists', { candidateId: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shortlist'] });
      // Shortlisting grants access to the résumé and contact details — refresh them.
      void qc.invalidateQueries({ queryKey: ['candidate', id] });
    },
  });

  const download = useMutation({
    mutationFn: (path: string) => api.saveFile(path.replace(/^\/api/, ''), 'resume'),
  });

  if (detail.isLoading) return <Loading />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const c = detail.data!;
  const meta = [
    c.headline,
    t('analysis.experience', { count: c.yearsExperience }),
    c.location,
  ].filter((x): x is string => Boolean(x && String(x).trim()));

  return (
    <section className="stack">
      <div className="card stack">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-4)' }}>
          <InitialAvatar name={c.displayName} size="lg" round />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{c.displayName}</h1>
            <p className="muted" style={{ margin: 'var(--space-1) 0 0' }}>
              {meta.join(' · ')}
            </p>
          </div>
        </div>
        <div className="row">
          <button
            type="button"
            className="secondary"
            onClick={() => shortlist.mutate()}
            disabled={shortlist.isPending || shortlist.isSuccess}
          >
            <Icons.Star size={16} aria-hidden="true" />
            {shortlist.isSuccess ? t('shortlist.added') : t('shortlist.add')}
          </button>
          {c.resumeDownloadUrl ? (
            <button
              type="button"
              className="secondary"
              disabled={download.isPending}
              onClick={() => download.mutate(c.resumeDownloadUrl!)}
            >
              <Icons.Download size={16} aria-hidden="true" />
              {t('talent.downloadResume')}
            </button>
          ) : null}
          {c.contactEmail ? (
            <button type="button" onClick={() => message.mutate(c.userId)}>
              <Icons.MessageSquare size={16} aria-hidden="true" />
              {t('messaging.start')}
            </button>
          ) : null}
        </div>
        {c.contactEmail ? (
          <p className="row" style={{ margin: 0, gap: 'var(--space-2)' }}>
            <span className="muted">{t('talent.contact')}</span>
            <span data-testid="contact-email">{c.contactEmail}</span>
          </p>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            {t('talent.noAccess')}
          </p>
        )}
        {download.error || message.error ? (
          <div className="field-error" role="alert">
            {localizeError(t, download.error ?? message.error)}
          </div>
        ) : null}
      </div>

      {c.summary ? (
        <div className="card">
          <h2>{t('analysis.summary')}</h2>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.summary}</p>
        </div>
      ) : null}

      <div className="card">
        <h2>{t('analysis.skills')}</h2>
        <ul className="list-reset">
          {c.skills.map((s) => (
            <li key={s.name} className="skill-row">
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <strong>{s.name}</strong>
                <span className={`prof-badge ${s.proficiency}`}>
                  {t(`analysis.proficiency.${s.proficiency}`)}
                </span>
              </span>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {t('analysis.years', { count: Math.round(s.yearsExperience) })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
