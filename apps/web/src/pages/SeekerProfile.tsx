import { useState } from 'react';
import {
  PROFICIENCY_WEIGHT,
  validateUpload,
  type CandidateProfile,
  type ParseJob,
  type SkillAnalysis,
  type UploadResult,
} from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { localizeError } from '../lib/errors';
import { RadarChart } from '../components/RadarChart';
import { ResumeDropzone } from '../components/ResumeDropzone';
import { EmptyState, ErrorState, Field, Loading } from '../components/ui';

export default function SeekerProfile(): JSX.Element {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseJob, setParseJob] = useState<ParseJob | null>(null);

  const profile = useQuery({
    queryKey: ['candidate-me'],
    queryFn: () => api.get<CandidateProfile>('/candidates/me'),
  });

  const analysis = useQuery({
    queryKey: ['candidate-analysis'],
    queryFn: () => api.get<SkillAnalysis>('/candidates/me/analysis'),
    retry: false,
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<UploadResult>('/candidates/me/resume', file),
    onSuccess: (res) => {
      setParseJob(res.parseJob);
      void qc.invalidateQueries({ queryKey: ['candidate-me'] });
      void qc.invalidateQueries({ queryKey: ['candidate-analysis'] });
    },
    onError: (err) => setUploadError(localizeError(t, err)),
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.post<ParseJob>(`/candidates/me/parse-jobs/${id}/retry`),
    onSuccess: (pj) => {
      setParseJob(pj);
      void qc.invalidateQueries({ queryKey: ['candidate-analysis'] });
    },
  });

  const regenerate = useMutation({
    mutationFn: () => api.post<SkillAnalysis>('/candidates/me/analysis', { locale: i18n.language }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['candidate-analysis'] }),
  });

  function onSelect(file: File): void {
    setUploadError(null);
    const failure = validateUpload({ filename: file.name, mime: file.type, sizeBytes: file.size });
    if (failure) {
      setUploadError(t(failure));
      return;
    }
    upload.mutate(file);
  }

  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  const me = profile.data!;
  const status = parseJob?.status;
  const a = !(analysis.error instanceof ApiError) ? analysis.data : undefined;

  const radarPoints = (a?.skills ?? [])
    .slice(0, 6)
    .map((s) => ({ label: s.name, value: PROFICIENCY_WEIGHT[s.proficiency] }));

  return (
    <section className="grid cols-2">
      <div className="stack">
        <div className="card">
          <h1>{t('resume.title')}</h1>
          <ResumeDropzone onSelect={onSelect} disabled={upload.isPending} />
          {uploadError ? (
            <div className="field-error" role="alert">
              {uploadError}
            </div>
          ) : null}
          {upload.isPending ? <p role="status">{t('resume.processing')}</p> : null}
          {status ? (
            <p data-testid="parse-status">
              {t('common.status')}: <strong>{t(`resume.status.${status}`)}</strong>
            </p>
          ) : null}
          {status === 'failed' && parseJob ? (
            <button type="button" className="secondary" onClick={() => retry.mutate(parseJob.id)}>
              {t('resume.retry')}
            </button>
          ) : null}
        </div>

        <ProfileForm me={me} />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{t('analysis.title')}</h2>
          {me.hasAnalysis ? (
            <button type="button" className="secondary" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
              {t('analysis.regenerate')}
            </button>
          ) : null}
        </div>
        {analysis.isLoading ? (
          <Loading />
        ) : !a ? (
          <EmptyState message={t('analysis.none')} />
        ) : (
          <div className="stack">
            <p>{a.summary}</p>
            <section>
              <h3>{t('analysis.radarTitle')}</h3>
              {radarPoints.length >= 3 ? <RadarChart points={radarPoints} /> : null}
            </section>
            <section>
              <h3>{t('analysis.skills')}</h3>
              <ul className="list-reset">
                {a.skills.map((s) => (
                  <li key={s.name} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {s.name} <span className="muted">· {t(`analysis.proficiency.${s.proficiency}`)}</span>
                    </span>
                    <span className="muted">{t('analysis.years', { count: Math.round(s.yearsExperience) })}</span>
                  </li>
                ))}
              </ul>
            </section>
            {a.careerDirections.length > 0 && (
              <section>
                <h3>{t('analysis.careerDirections')}</h3>
                <ul>
                  {a.careerDirections.map((d) => (
                    <li key={d.title}>
                      <strong>{d.title}</strong> — <span className="muted">{d.rationale}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {a.recommendedLearning.length > 0 && (
              <section>
                <h3>{t('analysis.recommendedLearning')}</h3>
                <ul>
                  {a.recommendedLearning.map((l) => (
                    <li key={l.area}>
                      <strong>{l.area}</strong> — <span className="muted">{l.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileForm({ me }: { me: CandidateProfile }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [headline, setHeadline] = useState(me.headline ?? '');
  const [location, setLocation] = useState(me.location ?? '');
  const [years, setYears] = useState(String(me.yearsExperience));
  const [openToWork, setOpenToWork] = useState(me.openToWork);
  const [languages, setLanguages] = useState(me.languages.join(', '));
  const [error, setError] = useState<unknown>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch<CandidateProfile>('/candidates/me', {
        headline,
        location,
        yearsExperience: Number(years),
        openToWork,
        languages: languages
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['candidate-me'] });
    },
    onError: setError,
  });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>{t('profile.title')}</h2>
      <Field label={t('profile.headline')} htmlFor="headline">
        <input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field label={t('profile.location')} htmlFor="location">
        <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label={t('profile.yearsExperience')} htmlFor="years">
        <input id="years" type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
      </Field>
      <Field label={t('profile.languages')} htmlFor="languages">
        <input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} />
      </Field>
      <label className="row">
        <input type="checkbox" style={{ width: 'auto' }} checked={openToWork} onChange={(e) => setOpenToWork(e.target.checked)} />
        {t('profile.openToWork')}
      </label>
      {error ? (
        <div className="field-error" role="alert">
          {localizeError(t, error)}
        </div>
      ) : null}
      <button type="submit" disabled={save.isPending}>
        {save.isPending ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}
