import { useState } from 'react';
import {
  INTERVIEW_MODES,
  RECRUITMENT_STAGES,
  type Application,
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
import { Badge, EmptyState, ErrorState, Loading } from '../components/ui';

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

  return (
    <section className="stack">
      <div className="card">
        <h1>{job.data!.title}</h1>
        <span className="row">
          <Badge>{t(`job.status.${job.data!.status}`)}</Badge>
          <Badge>{t(`job.visibilityValue.${job.data!.visibility}`)}</Badge>
        </span>
      </div>

      <div className="card">
        <h2>{t('match.candidates.title')}</h2>
        {candidates.isLoading ? (
          <Loading />
        ) : (candidates.data?.length ?? 0) === 0 ? (
          <EmptyState message={t('match.candidates.empty')} />
        ) : (
          <ul className="list-reset stack">
            {candidates.data!.map((c) => (
              <li key={c.id} className="row" style={{ justifyContent: 'space-between' }} data-testid="ranked-candidate">
                <span>
                  <Link to={`/talent/${c.candidateId}`}>{c.candidateName}</Link>
                  <span className="muted"> — {c.reason}</span>
                </span>
                <span className="score">{c.score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>{t('application.title')}</h2>
        {applications.isLoading ? (
          <Loading />
        ) : (applications.data?.length ?? 0) === 0 ? (
          <EmptyState message={t('application.empty')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('talent.detail')}</th>
                <th>{t('match.score')}</th>
                <th>{t('application.advance')}</th>
                <th>{t('interview.title')}</th>
              </tr>
            </thead>
            <tbody>
              {applications.data!.map((app) => (
                <tr key={app.id}>
                  <td>{app.candidateName}</td>
                  <td>{app.matchScore ?? '—'}</td>
                  <td>
                    <label htmlFor={`stage-${app.id}`} className="visually-hidden">
                      {t('application.advance')}
                    </label>
                    <select
                      id={`stage-${app.id}`}
                      value={app.stage}
                      onChange={(e) => setStage.mutate({ appId: app.id, stage: e.target.value as RecruitmentStage })}
                    >
                      {RECRUITMENT_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {t(`application.stage.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <InterviewForm applicationId={app.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {setStage.error ? (
          <div className="field-error" role="alert">
            {localizeError(t, setStage.error)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InterviewForm({ applicationId }: { applicationId: string }): JSX.Element {
  const { t } = useTranslation();
  const [when, setWhen] = useState('');
  const [mode, setMode] = useState<InterviewMode>('online');
  const [open, setOpen] = useState(false);
  const propose = useMutation({
    mutationFn: () =>
      api.post(`/applications/${applicationId}/interviews`, {
        scheduledAt: new Date(when).toISOString(),
        mode,
        durationMinutes: 45,
      }),
    onSuccess: () => setOpen(false),
  });

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        {t('interview.propose')}
      </button>
    );
  }
  return (
    <form
      className="row"
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
      <select aria-label={t('interview.mode')} value={mode} onChange={(e) => setMode(e.target.value as InterviewMode)}>
        {INTERVIEW_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`interview.modeValue.${m}`)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={propose.isPending}>
        {t('common.confirm')}
      </button>
    </form>
  );
}
