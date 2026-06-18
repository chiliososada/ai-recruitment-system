import type { Application } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, EmptyState, ErrorState, Loading } from '../components/ui';

export default function MyApplications(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const apps = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => api.get<Application[]>('/applications'),
  });
  const withdraw = useMutation({
    mutationFn: (id: string) =>
      api.patch<Application>(`/applications/${id}/stage`, { stage: 'withdrawn' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-applications'] }),
  });

  if (apps.isLoading) return <Loading />;
  if (apps.error) return <ErrorState error={apps.error} onRetry={() => apps.refetch()} />;
  const items = apps.data ?? [];

  return (
    <section className="stack">
      <h1>{t('application.title')}</h1>
      {items.length === 0 ? (
        <EmptyState message={t('application.empty')} />
      ) : (
        <ul className="list-reset stack">
          {items.map((app) => (
            <li key={app.id} className="card row" style={{ justifyContent: 'space-between' }}>
              <div>
                <Link to={`/jobs/${app.jobId}`}>
                  <strong>{app.jobTitle}</strong>
                </Link>
                <div className="muted">{app.companyName}</div>
              </div>
              <div className="row">
                <Badge>{t(`application.stage.${app.stage}`)}</Badge>
                {['applied', 'screening', 'interview', 'offer'].includes(app.stage) && (
                  <button type="button" className="danger" onClick={() => withdraw.mutate(app.id)}>
                    {t('application.withdraw')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
