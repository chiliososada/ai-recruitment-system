import type { Notification } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateTime, notificationBody, notificationLink } from '../lib/format';
import { EmptyState, Loading, PageHeader } from '../components/ui';
import { Icons } from '../design';

export default function Notifications(): JSX.Element {
  const { t, i18n } = useTranslation();
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
      <PageHeader
        title={t('notification.title')}
        desc={t('pageDesc.notifications')}
        actions={
          items.some((n) => !n.readAt) ? (
            <button type="button" className="secondary" onClick={() => markAll.mutate()}>
              {t('notification.markAllRead')}
            </button>
          ) : null
        }
      />
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
                <Icons.CalendarClock size={18} />
              ) : n.type.startsWith('application') ? (
                <Icons.Briefcase size={18} />
              ) : (
                <Icons.Bell size={18} />
              );
            const body = notificationBody(t, n);
            const link = notificationLink(n.link);
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
                    if (!n.readAt) markOne.mutate(n.id);
                    if (link) navigate(link);
                  }}
                >
                  <span className={`icon-chip ${n.readAt ? '' : 'violet'}`} aria-hidden="true">
                    {icon}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: 'var(--color-text)' }}>
                      {t(`notification.types.${n.type}`)}
                    </strong>
                    {body ? (
                      <span
                        className="muted"
                        style={{
                          display: 'block',
                          fontWeight: 'var(--weight-regular)',
                          fontSize: 'var(--text-sm)',
                        }}
                      >
                        {body}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="muted"
                    style={{
                      fontWeight: 'var(--weight-regular)',
                      fontSize: 'var(--text-xs)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDateTime(n.createdAt, i18n.language)}
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
