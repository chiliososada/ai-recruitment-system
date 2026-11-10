import { useEffect, useState } from 'react';
import {
  PROFICIENCY_WEIGHT,
  validateUpload,
  type CandidateProfile,
  type ParseJob,
  type ResumeFile,
  type SkillAnalysis,
  type UploadResult,
} from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import { api, ApiError } from '../lib/api';
import { localizeError } from '../lib/errors';
import { formatDate } from '../lib/format';
import { RadarChart } from '../components/RadarChart';
import { ResumeDropzone } from '../components/ResumeDropzone';
import { EmptyState, ErrorState, Field, Loading, PageHeader } from '../components/ui';
import { Icons } from '../design';

const IN_FLIGHT = new Set(['pending', 'processing']);

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

  const resumes = useQuery({
    queryKey: ['my-resumes'],
    queryFn: () => api.get<ResumeFile[]>('/candidates/me/resumes'),
  });

  // Poll the parse job while the AI is working, then refresh the analysis (FR-02.5).
  const parseStatus = useQuery({
    queryKey: ['parse-job', parseJob?.id],
    queryFn: () => api.get<ParseJob>(`/candidates/me/parse-jobs/${parseJob!.id}`),
    enabled: Boolean(parseJob && IN_FLIGHT.has(parseJob.status)),
    refetchInterval: 2000,
  });
  useEffect(() => {
    const latest = parseStatus.data;
    if (!latest || !parseJob || latest.id !== parseJob.id) return;
    if (latest.status !== parseJob.status) {
      setParseJob(latest);
      if (latest.status === 'succeeded') {
        void qc.invalidateQueries({ queryKey: ['candidate-me'] });
        void qc.invalidateQueries({ queryKey: ['candidate-analysis'] });
        void qc.invalidateQueries({ queryKey: ['recommendations'] });
      }
    }
  }, [parseStatus.data, parseJob, qc]);

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<UploadResult>('/candidates/me/resume', file),
    onSuccess: (res) => {
      setParseJob(res.parseJob);
      void qc.invalidateQueries({ queryKey: ['my-resumes'] });
      if (res.parseJob.status === 'succeeded') {
        void qc.invalidateQueries({ queryKey: ['candidate-me'] });
        void qc.invalidateQueries({ queryKey: ['candidate-analysis'] });
      }
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

  const download = useMutation({
    mutationFn: (r: ResumeFile) => api.saveFile(`/resumes/${r.id}/download`, r.filename),
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
  const current = [...(resumes.data ?? [])].sort((x, y) =>
    y.createdAt.localeCompare(x.createdAt),
  )[0];

  const radarPoints = (a?.skills ?? [])
    .slice(0, 6)
    .map((s) => ({ label: s.name, value: PROFICIENCY_WEIGHT[s.proficiency] }));

  return (
    <section className="stack">
      <PageHeader title={t('nav.resume')} desc={t('pageDesc.resume')} />
      <div className="grid cols-2">
        <div className="stack">
          <div className="card stack">
            <h2 style={{ margin: 0 }}>{t('resume.title')}</h2>
            {current ? (
              <div
                className="row"
                style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}
                data-testid="current-resume"
              >
                <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                  <Icons.FileText size={18} aria-hidden="true" />
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ wordBreak: 'break-all' }}>{current.filename}</strong>
                    <span
                      className="muted"
                      style={{ display: 'block', fontSize: 'var(--text-sm)' }}
                    >
                      {t('resume.current')} ·{' '}
                      {t('resume.uploadedAt', {
                        date: formatDate(current.createdAt, i18n.language),
                      })}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  className="secondary sm"
                  disabled={download.isPending}
                  onClick={() => download.mutate(current)}
                >
                  <Icons.Download size={15} aria-hidden="true" />
                  {t('resume.download')}
                </button>
              </div>
            ) : null}
            <ResumeDropzone onSelect={onSelect} disabled={upload.isPending} />
            {current ? (
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                {t('resume.replaceHint')}
              </p>
            ) : null}
            {uploadError ? (
              <div className="field-error" role="alert">
                {uploadError}
              </div>
            ) : null}
            {upload.isPending ? <p role="status">{t('resume.processing')}</p> : null}
            {status ? (
              <p data-testid="parse-status" role="status" style={{ margin: 0 }}>
                {t('common.status')}: <strong>{t(`resume.status.${status}`)}</strong>
                {IN_FLIGHT.has(status) ? (
                  <span className="muted" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                    {t('resume.analyzing')}
                  </span>
                ) : null}
              </p>
            ) : null}
            {status === 'failed' && parseJob ? (
              <>
                {parseJob.error ? (
                  <div className="field-error" role="alert">
                    {t(parseJob.error, { defaultValue: t('resume.parse.failed') })}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => retry.mutate(parseJob.id)}
                >
                  {t('resume.retry')}
                </button>
              </>
            ) : null}
          </div>

          <ProfileForm me={me} />
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t('analysis.title')}</h2>
            {me.hasAnalysis ? (
              <button
                type="button"
                className="secondary"
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
              >
                <Icons.Sparkles size={15} aria-hidden="true" />
                {regenerate.isPending ? t('common.loading') : t('analysis.regenerate')}
              </button>
            ) : null}
          </div>
          {regenerate.error ? (
            <div className="field-error" role="alert">
              {localizeError(t, regenerate.error)}
            </div>
          ) : null}
          {analysis.isLoading ? (
            <Loading />
          ) : !a ? (
            <EmptyState message={t('analysis.none')} />
          ) : (
            <div className="stack">
              <section>
                <h3>{t('analysis.summary')}</h3>
                <p style={{ margin: 0 }}>{a.summary}</p>
              </section>
              <section>
                <h3>{t('analysis.radarTitle')}</h3>
                {radarPoints.length >= 3 ? <RadarChart points={radarPoints} /> : null}
              </section>
              <section>
                <h3>{t('analysis.skills')}</h3>
                <ul className="list-reset">
                  {a.skills.map((s) => (
                    <li key={s.name} className="skill-row">
                      <span className="row" style={{ gap: 'var(--space-2)' }}>
                        <strong>{s.name}</strong>
                        <span className={`prof-badge ${s.proficiency}`}>
                          {t(`analysis.proficiency.${s.proficiency}`)}
                        </span>
                      </span>
                      <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {t('analysis.years', { count: Math.round(s.yearsExperience) })}
                      </span>
                      <span className="level-bar" aria-hidden="true">
                        <span
                          className="level-fill"
                          style={{ width: `${PROFICIENCY_WEIGHT[s.proficiency] * 100}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {a.strengths.length > 0 && (
                <section>
                  <h3>{t('analysis.strengths')}</h3>
                  <ul>
                    {a.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
              )}
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
      </div>
    </section>
  );
}

function toNumberOrNull(v: string): number | null {
  const n = Number(v.replace(/[,，\s]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) ? null : Math.round(n);
}

function ProfileForm({ me }: { me: CandidateProfile }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [headline, setHeadline] = useState(me.headline ?? '');
  const [summary, setSummary] = useState(me.summary ?? '');
  const [location, setLocation] = useState(me.location ?? '');
  const [years, setYears] = useState(String(me.yearsExperience));
  const [salaryMin, setSalaryMin] = useState(
    me.desiredSalaryMin != null ? String(me.desiredSalaryMin) : '',
  );
  const [salaryMax, setSalaryMax] = useState(
    me.desiredSalaryMax != null ? String(me.desiredSalaryMax) : '',
  );
  const [openToWork, setOpenToWork] = useState(me.openToWork);
  const [languages, setLanguages] = useState(me.languages.join(', '));
  const [error, setError] = useState<unknown>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch<CandidateProfile>('/candidates/me', {
        headline,
        summary,
        location,
        yearsExperience: Number(years),
        openToWork,
        desiredSalaryMin: toNumberOrNull(salaryMin),
        desiredSalaryMax: toNumberOrNull(salaryMax),
        languages: languages
          .split(/[,、，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['candidate-me'] });
    },
    onError: setError,
  });

  const dirty =
    !save.isPending &&
    (headline !== (me.headline ?? '') ||
      summary !== (me.summary ?? '') ||
      location !== (me.location ?? '') ||
      years !== String(me.yearsExperience) ||
      salaryMin !== (me.desiredSalaryMin != null ? String(me.desiredSalaryMin) : '') ||
      salaryMax !== (me.desiredSalaryMax != null ? String(me.desiredSalaryMax) : '') ||
      openToWork !== me.openToWork ||
      languages !== me.languages.join(', '));
  useUnsavedChangesWarning(dirty);

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
        <input
          id="headline"
          value={headline}
          placeholder={t('profile.headlinePlaceholder')}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </Field>
      <Field label={t('profile.summary')} htmlFor="summary">
        <textarea
          id="summary"
          rows={4}
          value={summary}
          placeholder={t('profile.summaryPlaceholder')}
          onChange={(e) => setSummary(e.target.value)}
        />
      </Field>
      <div className="row">
        <Field label={t('profile.yearsExperience')} htmlFor="years">
          <input
            id="years"
            type="number"
            min={0}
            max={60}
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </Field>
        <Field label={t('profile.location')} htmlFor="location">
          <input
            id="location"
            value={location}
            placeholder={t('profile.locationPlaceholder')}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
      </div>
      <div className="row">
        <Field label={t('profile.desiredSalaryMin')} htmlFor="salaryMin">
          <input
            id="salaryMin"
            type="number"
            min={0}
            step={10000}
            value={salaryMin}
            placeholder="5000000"
            onChange={(e) => setSalaryMin(e.target.value)}
          />
        </Field>
        <Field label={t('profile.desiredSalaryMax')} htmlFor="salaryMax">
          <input
            id="salaryMax"
            type="number"
            min={0}
            step={10000}
            value={salaryMax}
            placeholder="7000000"
            onChange={(e) => setSalaryMax(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t('profile.languages')} htmlFor="languages">
        <input
          id="languages"
          value={languages}
          placeholder={t('profile.languagesPlaceholder')}
          onChange={(e) => setLanguages(e.target.value)}
        />
      </Field>
      <label className="row">
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={openToWork}
          onChange={(e) => setOpenToWork(e.target.checked)}
        />
        {t('profile.openToWork')}
      </label>
      {error ? (
        <div className="field-error" role="alert">
          {localizeError(t, error)}
        </div>
      ) : null}
      {save.isSuccess && !dirty ? (
        <p role="status" className="muted" style={{ margin: 0 }}>
          <Icons.CheckCircle2 size={15} aria-hidden="true" /> {t('profile.saved')}
        </p>
      ) : null}
      <button type="submit" disabled={save.isPending}>
        {save.isPending ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}
