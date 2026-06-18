import { useState } from 'react';
import {
  JOB_STATUSES,
  JOB_VISIBILITIES,
  WORK_STYLES,
  type Company,
  type Job,
  type JobStatus,
  type JobVisibility,
  type WorkStyle,
} from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { localizeError, localizeFieldErrors } from '../lib/errors';
import { Badge, EmptyState, ErrorState, Field, Loading } from '../components/ui';

function splitList(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function CompanyManage(): JSX.Element {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const qc = useQueryClient();

  const company = useQuery({ queryKey: ['company', id], queryFn: () => api.get<Company>(`/companies/${id}`) });
  const jobs = useQuery({
    queryKey: ['manage-jobs', id],
    queryFn: () => api.get<Job[]>(`/companies/${id}/manage/jobs`),
  });

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Engineering');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState('');
  const [preferred, setPreferred] = useState('');
  const [minYears, setMinYears] = useState('0');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [workStyle, setWorkStyle] = useState<WorkStyle>('onsite');
  const [status, setStatus] = useState<JobStatus>('open');
  const [visibility, setVisibility] = useState<JobVisibility>('public');
  const [error, setError] = useState<unknown>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<Job>(`/companies/${id}/jobs`, {
        title,
        category,
        description,
        requiredSkills: splitList(required),
        preferredSkills: splitList(preferred),
        minYears: Number(minYears),
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        workStyle,
        status,
        visibility,
      }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setRequired('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['manage-jobs', id] });
    },
    onError: setError,
  });

  if (company.isLoading) return <Loading />;
  if (company.error) return <ErrorState error={company.error} onRetry={() => company.refetch()} />;
  const fieldErrors = localizeFieldErrors(t, error);

  return (
    <section className="grid cols-2">
      <div className="stack">
        <div className="card">
          <h1>{company.data!.name}</h1>
          <p className="muted">{company.data!.industry}</p>
        </div>
        <div className="card">
          <h2>{t('job.list')}</h2>
          {jobs.isLoading ? (
            <Loading />
          ) : (jobs.data?.length ?? 0) === 0 ? (
            <EmptyState message={t('job.empty')} />
          ) : (
            <ul className="list-reset stack">
              {jobs.data!.map((j) => (
                <li key={j.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <Link to={`/console/jobs/${j.id}`}>{j.title}</Link>
                  <span className="row">
                    <Badge>{t(`job.status.${j.status}`)}</Badge>
                    <Badge>{t(`job.visibilityValue.${j.visibility}`)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2>{t('job.create')}</h2>
        <Field label={t('job.title')} htmlFor="title">
          <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('job.category')} htmlFor="category">
          <input id="category" required value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label={t('job.description')} htmlFor="description" error={fieldErrors.description}>
          <textarea id="description" required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('job.requiredSkills')} htmlFor="required">
          <input id="required" value={required} onChange={(e) => setRequired(e.target.value)} />
        </Field>
        <Field label={t('job.preferredSkills')} htmlFor="preferred">
          <input id="preferred" value={preferred} onChange={(e) => setPreferred(e.target.value)} />
        </Field>
        <div className="row">
          <Field label={t('job.minYears')} htmlFor="minYears">
            <input id="minYears" type="number" min={0} value={minYears} onChange={(e) => setMinYears(e.target.value)} />
          </Field>
          <Field label={t('job.salaryMin')} htmlFor="salaryMin">
            <input id="salaryMin" type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
          </Field>
          <Field label={t('job.salaryMax')} htmlFor="salaryMax" error={fieldErrors.salaryMax}>
            <input id="salaryMax" type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label={t('job.workStyle')} htmlFor="ws">
            <select id="ws" value={workStyle} onChange={(e) => setWorkStyle(e.target.value as WorkStyle)}>
              {WORK_STYLES.map((w) => (
                <option key={w} value={w}>
                  {t(`job.workStyleValue.${w}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('job.statusLabel')} htmlFor="st">
            <select id="st" value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`job.status.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('job.visibility')} htmlFor="vis">
            <select id="vis" value={visibility} onChange={(e) => setVisibility(e.target.value as JobVisibility)}>
              {JOB_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {t(`job.visibilityValue.${v}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error && Object.keys(fieldErrors).length === 0 ? (
          <div className="field-error" role="alert">
            {localizeError(t, error)}
          </div>
        ) : null}
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : t('job.create')}
        </button>
      </form>
    </section>
  );
}
