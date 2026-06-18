import { useState } from 'react';
import type { Job } from '@ars/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { ErrorState, Loading } from '../components/ui';

export default function JobDetail(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [applied, setApplied] = useState(false);

  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  const apply = useMutation({
    mutationFn: () => api.post('/applications', { jobId: id }),
    onSuccess: () => setApplied(true),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFLICT') setApplied(true);
    },
  });

  if (job.isLoading) return <Loading />;
  if (job.error) return <ErrorState error={job.error} onRetry={() => job.refetch()} />;
  const j = job.data!;

  return (
    <article className="card stack">
      <h1>{j.title}</h1>
      <p className="muted">
        <Link to={`/companies/${j.companyId}`}>{j.companyName}</Link> · {j.category} ·{' '}
        {t(`job.workStyleValue.${j.workStyle}`)}
        {j.location ? ` · ${j.location}` : ''}
      </p>
      {j.salaryMin || j.salaryMax ? (
        <p>
          {t('job.salaryMin')}: {j.salaryMin ?? '—'} – {j.salaryMax ?? '—'} {j.currency}
        </p>
      ) : null}
      <p style={{ whiteSpace: 'pre-wrap' }}>{j.description}</p>
      <div>
        <h3>{t('job.requiredSkills')}</h3>
        {j.requiredSkills.map((s) => (
          <span key={s} className="tag">
            {s}
          </span>
        ))}
      </div>
      {j.preferredSkills.length > 0 && (
        <div>
          <h3>{t('job.preferredSkills')}</h3>
          {j.preferredSkills.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
      )}
      {user?.role === 'job_seeker' && (
        <div className="stack">
          <button
            type="button"
            disabled={apply.isPending || applied}
            onClick={() => apply.mutate()}
          >
            {applied ? t('job.applied') : t('application.apply')}
          </button>
          {apply.error && !(apply.error instanceof ApiError && apply.error.code === 'CONFLICT') ? (
            <div className="field-error" role="alert">
              {localizeError(t, apply.error)}
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
