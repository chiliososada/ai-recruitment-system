import type { Application, Interview } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { localizeError } from '../lib/errors';
import { formatDate, formatDateTime } from '../lib/format';
import { Badge, EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { Icons, InitialAvatar } from '../design';

const ACTIVE_STAGES = ['applied', 'screening', 'interview', 'offer'];

export default function MyApplications(): JSX.Element {
  const { t, i18n } = useTranslation();
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
      <PageHeader title={t('application.title')} desc={t('pageDesc.applications')} />
      {items.length === 0 ? (
        <EmptyState message={t('application.empty')} />
      ) : (
        <ul className="list-reset stack">
          {items.map((app) => (
            <li key={app.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-3)' }}>
                  <InitialAvatar name={app.companyName ?? app.jobTitle ?? '?'} />
                  <div>
                    <Link to={`/jobs/${app.jobId}`}>
                      <strong>{app.jobTitle}</strong>
                    </Link>
                    <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {app.companyName} ·{' '}
                      {t('application.appliedAt', {
                        date: formatDate(app.createdAt, i18n.language),
                      })}
                    </div>
                  </div>
                </div>
                <div className="row">
                  <Badge
                    variant={
                      app.stage === 'hired' || app.stage === 'offer'
                        ? 'success'
                        : app.stage === 'rejected' || app.stage === 'withdrawn'
                          ? 'danger'
                          : app.stage === 'interview' || app.stage === 'screening'
                            ? 'info'
                            : undefined
                    }
                  >
                    {t(`application.stage.${app.stage}`)}
                  </Badge>
                  {ACTIVE_STAGES.includes(app.stage) && (
                    <button
                      type="button"
                      className="secondary sm"
                      disabled={withdraw.isPending}
                      onClick={() => {
                        if (window.confirm(t('application.withdrawConfirm')))
                          withdraw.mutate(app.id);
                      }}
                    >
                      {t('application.withdraw')}
                    </button>
                  )}
                </div>
              </div>
              <ApplicationInterviews applicationId={app.id} />
            </li>
          ))}
        </ul>
      )}
      {withdraw.error ? (
        <div className="field-error" role="alert">
          {localizeError(t, withdraw.error)}
        </div>
      ) : null}
    </section>
  );
}

/** Interviews the company proposed for this application, with confirm / decline for open ones. */
function ApplicationInterviews({ applicationId }: { applicationId: string }): JSX.Element | null {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const interviews = useQuery({
    queryKey: ['app-interviews', applicationId],
    queryFn: () => api.get<Interview[]>(`/applications/${applicationId}/interviews`),
  });
  const respond = useMutation({
    mutationFn: (vars: { id: string; response: 'confirmed' | 'declined' }) =>
      api.post<Interview>(`/interviews/${vars.id}/respond`, { response: vars.response }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['app-interviews', applicationId] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const list = [...(interviews.data ?? [])].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  );
  if (list.length === 0) return null;

  return (
    <div
      className="stack"
      style={{
        gap: 'var(--space-2)',
        borderTop: '1px solid var(--color-border)',
        paddingTop: 'var(--space-3)',
      }}
    >
      <strong style={{ fontSize: 'var(--text-sm)' }}>{t('interview.upcoming')}</strong>
      {list.map((iv) => (
        <div
          key={iv.id}
          className="row"
          style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}
          data-testid="interview-row"
        >
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <Icons.CalendarClock size={16} aria-hidden="true" />
            <span>
              <strong>{formatDateTime(iv.scheduledAt, i18n.language)}</strong>
              <span className="muted">
                {' '}
                · {t('interview.durationValue', { count: iv.durationMinutes })} ·{' '}
                {t(`interview.modeValue.${iv.mode}`)}
                {iv.location ? ` · ${iv.location}` : ''}
              </span>
            </span>
            <Badge
              variant={
                iv.status === 'confirmed'
                  ? 'success'
                  : iv.status === 'proposed'
                    ? 'warning'
                    : iv.status === 'declined' || iv.status === 'cancelled'
                      ? 'danger'
                      : undefined
              }
            >
              {t(`interview.status.${iv.status}`)}
            </Badge>
          </div>
          {iv.status === 'proposed' ? (
            <div className="row">
              <button
                type="button"
                className="sm"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: iv.id, response: 'confirmed' })}
              >
                <Icons.Check size={15} aria-hidden="true" />
                {t('interview.accept')}
              </button>
              <button
                type="button"
                className="secondary sm"
                disabled={respond.isPending}
                onClick={() => {
                  if (window.confirm(t('interview.declineConfirm'))) {
                    respond.mutate({ id: iv.id, response: 'declined' });
                  }
                }}
              >
                {t('interview.declineAction')}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      {respond.error ? (
        <div className="field-error" role="alert">
          {localizeError(t, respond.error)}
        </div>
      ) : null}
    </div>
  );
}
