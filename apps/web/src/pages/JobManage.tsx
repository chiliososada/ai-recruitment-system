import { useState } from 'react';
import {
  INTERVIEW_MODES,
  MATCH_MIN_SCORE,
  RECRUITMENT_STAGES,
  type Application,
  type Interview,
  type InterviewMode,
  type Job,
  type MatchResult,
  type RecruitmentStage,
} from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { localizeError } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { Badge, EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { MatchExplanation } from '../components/MatchExplanation';
import { Icons, ScoreRing } from '../design';

export default function JobManage(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const qc = useQueryClient();

  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.get<Job>(`/jobs/${id}`) });
  const applications = useQuery({
    queryKey: ['job-apps', id],
    queryFn: () => api.get<Application[]>(`/jobs/${id}/applications`),
  });
  const candidates = useQuery({
    queryKey: ['job-candidates', id],
    queryFn: () => api.get<MatchResult[]>(`/jobs/${id}/candidates`),
  });

  const setStage = useMutation({
    mutationFn: (vars: { appId: string; stage: RecruitmentStage }) =>
      api.patch<Application>(`/applications/${vars.appId}/stage`, { stage: vars.stage }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['job-apps', id] }),
  });

  if (job.isLoading) return <Loading />;
  if (job.error) return <ErrorState error={job.error} onRetry={() => job.refetch()} />;
  const j = job.data!;
  const knownSkills = [...j.requiredSkills, ...j.preferredSkills];

  return (
    <section className="stack">
      <Link to={`/console/companies/${j.companyId}`} className="meta-item">
        <Icons.ChevronLeft size={16} aria-hidden="true" />
        {t('job.backToList')}
      </Link>
      <PageHeader
        title={j.title}
        desc={t('pageDesc.jobManage')}
        actions={
          <>
            <Badge>{t(`job.status.${j.status}`)}</Badge>
            <Badge>{t(`job.visibilityValue.${j.visibility}`)}</Badge>
          </>
        }
      />

      <div className="card">
        <h2>{t('application.applicants')}</h2>
        {applications.isLoading ? (
          <Loading />
        ) : (applications.data?.length ?? 0) === 0 ? (
          <EmptyState message={t('application.emptyCompany')} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('application.applicant')}</th>
                  <th>{t('match.score')}</th>
                  <th>{t('application.stageLabel')}</th>
                  <th>{t('interview.title')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.data!.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <Link to={`/talent/${app.candidateId}?job=${id}`}>{app.candidateName}</Link>
                    </td>
                    <td>{app.matchScore ?? '—'}</td>
                    <td>
                      <label htmlFor={`stage-${app.id}`} className="visually-hidden">
                        {t('application.advance')}
                      </label>
                      <select
                        id={`stage-${app.id}`}
                        value={app.stage}
                        onChange={(e) =>
                          setStage.mutate({
                            appId: app.id,
                            stage: e.target.value as RecruitmentStage,
                          })
                        }
                      >
                        {RECRUITMENT_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {t(`application.stage.${s}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <InterviewCell applicationId={app.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {setStage.error ? (
          <div className="field-error" role="alert">
            {localizeError(t, setStage.error)}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}
        >
          <h2 style={{ margin: 0 }}>{t('match.candidates.title')}</h2>
          <Link to={`/talent?job=${id}`}>{t('match.candidates.viewAll')}</Link>
        </div>
        <p
          className="muted"
          style={{ margin: 'var(--space-1) 0 var(--space-3)', fontSize: 'var(--text-sm)' }}
        >
          {t('match.candidates.note', { min: MATCH_MIN_SCORE })}
        </p>
        {candidates.isLoading ? (
          <Loading />
        ) : (candidates.data?.length ?? 0) === 0 ? (
          <EmptyState message={t('match.candidates.empty', { min: MATCH_MIN_SCORE })} />
        ) : (
          <ul className="list-reset stack">
            {candidates.data!.map((c) => (
              <li
                key={c.id}
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'nowrap',
                  gap: 'var(--space-3)',
                }}
                data-testid="ranked-candidate"
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link to={`/talent/${c.candidateId}?job=${id}`}>
                    <strong>{c.candidateName}</strong>
                  </Link>
                  {c.candidateHeadline ? (
                    <span className="muted"> · {c.candidateHeadline}</span>
                  ) : null}
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <MatchExplanation match={c} knownSkills={knownSkills} maxMissing={3} />
                  </div>
                </div>
                <span aria-label={`${t('match.score')} ${c.score}/100`}>
                  <ScoreRing value={c.score} size={46} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InterviewCell({ applicationId }: { applicationId: string }): JSX.Element {
  const { t, i18n } = useTranslation();
  const interviews = useQuery({
    queryKey: ['app-interviews', applicationId],
    queryFn: () => api.get<Interview[]>(`/applications/${applicationId}/interviews`),
  });
  const list = [...(interviews.data ?? [])].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  );
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      {list.map((iv) => (
        <div key={iv.id} style={{ fontSize: 'var(--text-sm)' }}>
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
          </Badge>{' '}
          {formatDateTime(iv.scheduledAt, i18n.language)} · {t(`interview.modeValue.${iv.mode}`)}
          {iv.location ? ` · ${iv.location}` : ''}
        </div>
      ))}
      <InterviewForm applicationId={applicationId} />
    </div>
  );
}

function InterviewForm({ applicationId }: { applicationId: string }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [when, setWhen] = useState('');
  const [mode, setMode] = useState<InterviewMode>('online');
  const [location, setLocation] = useState('');
  const [open, setOpen] = useState(false);
  const propose = useMutation({
    mutationFn: () =>
      api.post(`/applications/${applicationId}/interviews`, {
        scheduledAt: new Date(when).toISOString(),
        mode,
        durationMinutes: 60,
        location: location.trim() || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setWhen('');
      setLocation('');
      void qc.invalidateQueries({ queryKey: ['app-interviews', applicationId] });
    },
  });

  if (!open) {
    return (
      <button type="button" className="ghost sm" onClick={() => setOpen(true)}>
        <Icons.CalendarClock size={15} aria-hidden="true" />
        {t('interview.propose')}
      </button>
    );
  }
  return (
    <form
      className="stack"
      style={{ gap: 'var(--space-2)', minWidth: 240 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (when) propose.mutate();
      }}
    >
      <label htmlFor={`when-${applicationId}`} className="visually-hidden">
        {t('interview.scheduledAt')}
      </label>
      <input
        id={`when-${applicationId}`}
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        required
      />
      <select
        aria-label={t('interview.mode')}
        value={mode}
        onChange={(e) => setMode(e.target.value as InterviewMode)}
      >
        {INTERVIEW_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`interview.modeValue.${m}`)}
          </option>
        ))}
      </select>
      <input
        aria-label={t('interview.location')}
        placeholder={t('interview.locationPlaceholder')}
        value={location}
        maxLength={300}
        onChange={(e) => setLocation(e.target.value)}
      />
      <div className="row">
        <button type="submit" className="sm" disabled={propose.isPending}>
          {t('interview.proposeSubmit')}
        </button>
        <button type="button" className="ghost sm" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
      {propose.error ? (
        <div className="field-error" role="alert">
          {localizeError(t, propose.error)}
        </div>
      ) : null}
    </form>
  );
}
