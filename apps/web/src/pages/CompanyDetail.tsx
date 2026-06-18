import { useState } from 'react';
import type { Company, Conversation, Job, Paginated } from '@ars/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { EmptyState, ErrorState, Loading } from '../components/ui';

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
        <h1>{c.name}</h1>
        <p className="muted">
          {c.industry ?? ''} {c.size ? `· ${c.size}` : ''} {c.location ? `· ${c.location}` : ''}
        </p>
        {c.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p> : null}
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

      <h2>{t('company.openJobs')}</h2>
      {jobs.isLoading ? (
        <Loading />
      ) : (jobs.data?.items.length ?? 0) === 0 ? (
        <EmptyState message={t('job.empty')} />
      ) : (
        <ul className="list-reset stack">
          {jobs.data!.items.map((j) => (
            <li key={j.id} className="card">
              <Link to={`/jobs/${j.id}`}>
                <strong>{j.title}</strong>
              </Link>{' '}
              <span className="muted">· {t(`job.workStyleValue.${j.workStyle}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
