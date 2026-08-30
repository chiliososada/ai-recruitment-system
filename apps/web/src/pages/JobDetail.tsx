import { useState } from 'react';
import type { Job } from '@ars/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { ErrorState, Loading } from '../components/ui';
import { Icons, InitialAvatar } from '../design';

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
  const hasSalary = j.salaryMin != null || j.salaryMax != null;

  return (
    <section className="stack" style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* ---- header ---- */}
      <div className="card">
        <div
          className="row"
          style={{ gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
        >
          <InitialAvatar name={j.companyName ?? j.title} size="lg" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0 }}>{j.title}</h1>
            <div className="meta-row" style={{ marginTop: 'var(--space-2)' }}>
              <span className="meta-item">
                <Icons.Building2 size={15} aria-hidden="true" />
                <Link to={`/companies/${j.companyId}`}>{j.companyName}</Link>
              </span>
              <span className="meta-item">{j.category}</span>
              <span className="meta-item">
                <Icons.Laptop size={15} aria-hidden="true" />
                {t(`job.workStyleValue.${j.workStyle}`)}
              </span>
              {j.location ? (
                <span className="meta-item">
                  <Icons.MapPin size={15} aria-hidden="true" />
                  {j.location}
                </span>
              ) : null}
            </div>
            {hasSalary ? (
              <div
                className="meta-item"
                style={{
                  marginTop: 'var(--space-3)',
                  fontWeight: 'var(--weight-bold)',
                  fontSize: 'var(--text-lg)',
                  color: 'var(--color-text)',
                }}
              >
                <Icons.Banknote size={18} aria-hidden="true" />
                {(j.salaryMin ?? 0).toLocaleString()} – {(j.salaryMax ?? 0).toLocaleString()}{' '}
                {j.currency}
              </div>
            ) : null}
          </div>
        </div>
        {user?.role === 'job_seeker' && (
          <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
            <button
              type="button"
              disabled={apply.isPending || applied}
              onClick={() => apply.mutate()}
            >
              {applied ? (
                <>
                  <Icons.CheckCircle2 size={16} aria-hidden="true" />
                  {t('job.applied')}
                </>
              ) : (
                <>
                  {t('application.apply')}
                  <Icons.ArrowRight size={16} aria-hidden="true" />
                </>
              )}
            </button>
            {apply.error &&
            !(apply.error instanceof ApiError && apply.error.code === 'CONFLICT') ? (
              <div className="field-error" role="alert">
                {localizeError(t, apply.error)}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ---- description ---- */}
      <div className="card">
        <h3>{t('job.description')}</h3>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{j.description}</p>
      </div>

      {/* ---- skills ---- */}
      <div className="card">
        <h3>{t('job.requiredSkills')}</h3>
        <div>
          {j.requiredSkills.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
        {j.preferredSkills.length > 0 && (
          <>
            <h3 style={{ marginTop: 'var(--space-4)' }}>{t('job.preferredSkills')}</h3>
            <div>
              {j.preferredSkills.map((s) => (
                <span key={s} className="tag plain">
                  {s}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
