import type { CandidateDetail as CandidateDetailDto, Conversation } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorState, Loading } from '../components/ui';

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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shortlist'] }),
  });

  async function download(path: string): Promise<void> {
    const url = await api.blobUrl(path.replace(/^\/api/, ''));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (detail.isLoading) return <Loading />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const c = detail.data!;

  return (
    <section className="stack">
      <div className="card">
        <h1>{c.displayName}</h1>
        <p className="muted">
          {c.headline ?? ''} · {c.yearsExperience}{' '}
          {t('analysis.years', { count: c.yearsExperience })}
          {c.location ? ` · ${c.location}` : ''}
        </p>
        <div className="row">
          <button type="button" className="secondary" onClick={() => shortlist.mutate()}>
            {t('shortlist.add')}
          </button>
          {c.resumeDownloadUrl ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void download(c.resumeDownloadUrl!)}
            >
              {t('talent.downloadResume')}
            </button>
          ) : (
            <span className="muted">{t('talent.noAccess')}</span>
          )}
          {c.contactEmail ? (
            <>
              <span data-testid="contact-email">{c.contactEmail}</span>
              <button type="button" onClick={() => message.mutate(c.userId)}>
                {t('messaging.start')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {c.summary ? (
        <div className="card">
          <h2>{t('analysis.summary')}</h2>
          <p>{c.summary}</p>
        </div>
      ) : null}

      <div className="card">
        <h2>{t('analysis.skills')}</h2>
        <ul className="list-reset">
          {c.skills.map((s) => (
            <li key={s.name} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                {s.name}{' '}
                <span className="muted">· {t(`analysis.proficiency.${s.proficiency}`)}</span>
              </span>
              <span className="muted">
                {t('analysis.years', { count: Math.round(s.yearsExperience) })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
