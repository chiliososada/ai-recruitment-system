import type { Notification } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { EmptyState, Loading } from '../components/ui';

export default function Notifications(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (list.isLoading) return <Loading />;
  const items = list.data ?? [];

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('notification.title')}</h1>
        {items.some((n) => !n.readAt) && (
          <button type="button" className="secondary" onClick={() => markAll.mutate()}>
            {t('notification.markAllRead')}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState message={t('notification.empty')} />
      ) : (
        <ul className="list-reset stack">
          {items.map((n) => (
            <li
              key={n.id}
              className="card"
              style={{ borderLeft: n.readAt ? undefined : '3px solid var(--primary)' }}
            >
              <button
                type="button"
                className="ghost"
                style={{ textAlign: 'left', width: '100%' }}
                onClick={() => {
                  markOne.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <strong>{t(`notification.types.${n.type}`)}</strong>
                {n.body ? <div className="muted">{n.body}</div> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
