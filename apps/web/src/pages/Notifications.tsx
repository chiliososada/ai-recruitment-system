import type { Notification } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { EmptyState, Loading } from '../components/ui';
import { Icons } from '../design';

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
      <div className="row page-header" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{t('notification.title')}</h1>
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
          {items.map((n) => {
            const icon =
              n.type === 'message' ? (
                <Icons.MessageSquare size={18} />
              ) : n.type === 'match_ready' ? (
                <Icons.Sparkles size={18} />
              ) : n.type.startsWith('interview') ? (
                <Icons.Users size={18} />
              ) : n.type.startsWith('application') ? (
                <Icons.Briefcase size={18} />
              ) : (
                <Icons.Bell size={18} />
              );
            return (
              <li
                key={n.id}
                className="card"
                style={{
                  padding: 'var(--space-3)',
                  borderLeft: n.readAt ? undefined : '3px solid var(--color-primary)',
                }}
              >
                <button
                  type="button"
                  className="ghost"
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    height: 'auto',
                    padding: 'var(--space-2)',
                    justifyContent: 'flex-start',
                    gap: 'var(--space-3)',
                  }}
                  onClick={() => {
                    markOne.mutate(n.id);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={`icon-chip ${n.readAt ? '' : 'violet'}`} aria-hidden="true">
                    {icon}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: 'var(--color-text)' }}>
                      {t(`notification.types.${n.type}`)}
                    </strong>
                    {n.body ? (
                      <span
                        className="muted"
                        style={{
                          display: 'block',
                          fontWeight: 'var(--weight-regular)',
                          fontSize: 'var(--text-sm)',
                        }}
                      >
                        {n.body}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
