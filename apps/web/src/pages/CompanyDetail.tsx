import { useState } from 'react';
import type { Company, Conversation, Job, Paginated } from '@ars/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { JobCard } from '../components/JobCard';
import { Icons, InitialAvatar } from '../design';

export default function CompanyDetail(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg] = useState('');

  const company = useQuery({
    queryKey: ['company', id],
    queryFn: () => api.get<Company>(`/companies/${id}`),
  });
  const jobs = useQuery({
    queryKey: ['company-jobs', id],
    queryFn: () => api.get<Paginated<Job>>(`/companies/${id}/jobs`),
  });
  const contact = useMutation({
    mutationFn: () =>
      api.post<Conversation>('/conversations/with-company', {
        companyId: id,
        initialMessage: msg || undefined,
      }),
    onSuccess: (c) => navigate(`/messages?c=${c.id}`),
  });

  if (company.isLoading) return <Loading />;
  if (company.error) return <ErrorState error={company.error} onRetry={() => company.refetch()} />;
  const c = company.data!;

  return (
    <section className="stack">
      <div className="card">
        <div
          className="row"
          style={{ gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
        >
          <InitialAvatar name={c.name} size="lg" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0 }}>{c.name}</h1>
            <div className="meta-row" style={{ marginTop: 'var(--space-2)' }}>
              {c.industry ? <span className="meta-item">{c.industry}</span> : null}
              {c.size ? (
                <span className="meta-item">
                  <Icons.Users size={15} aria-hidden="true" />
                  {c.size}
                </span>
              ) : null}
              {c.location ? (
                <span className="meta-item">
                  <Icons.MapPin size={15} aria-hidden="true" />
                  {c.location}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {c.description ? (
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--space-4)' }}>{c.description}</p>
        ) : null}
        {c.websiteUrl ? (
          <p>
            <a href={c.websiteUrl} target="_blank" rel="noreferrer">
              {c.websiteUrl}
            </a>
          </p>
        ) : null}
        {user?.role === 'job_seeker' && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              contact.mutate();
            }}
          >
            <label htmlFor="msg" className="visually-hidden">
              {t('messaging.newMessage')}
            </label>
            <input
              id="msg"
              placeholder={t('messaging.newMessage')}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
            <button type="submit" disabled={contact.isPending}>
              {t('messaging.start')}
            </button>
          </form>
        )}
        {contact.error ? (
          <div className="field-error" role="alert">
            {localizeError(t, contact.error)}
          </div>
        ) : null}
      </div>

      <h2 style={{ marginTop: 'var(--space-2)' }}>{t('company.openJobs')}</h2>
      {jobs.isLoading ? (
        <Loading />
      ) : (jobs.data?.items.length ?? 0) === 0 ? (
        <EmptyState message={t('job.empty')} />
      ) : (
        <div className="grid cols-2">
          {jobs.data!.items.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}
    </section>
  );
}
