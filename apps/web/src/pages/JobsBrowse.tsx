import { useState } from 'react';
import { WORK_STYLES, type Job, type Paginated, type WorkStyle } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { qs } from '../lib/qs';
import { EmptyState, ErrorState, Field, Loading } from '../components/ui';

export default function JobsBrowse(): JSX.Element {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [workStyle, setWorkStyle] = useState<WorkStyle | ''>('');
  const [skills, setSkills] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['jobs', q, workStyle, skills, page],
    queryFn: () =>
      api.get<Paginated<Job>>(`/jobs${qs({ q, workStyle: workStyle || undefined, skills, page })}`),
  });

  return (
    <section className="stack">
      <h1>{t('job.list')}</h1>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void query.refetch();
        }}
      >
        <Field label={t('common.search')} htmlFor="q">
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label={t('job.workStyle')} htmlFor="ws">
          <select id="ws" value={workStyle} onChange={(e) => setWorkStyle(e.target.value as WorkStyle | '')}>
            <option value="">{t('common.all')}</option>
            {WORK_STYLES.map((w) => (
              <option key={w} value={w}>
                {t(`job.workStyleValue.${w}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('job.requiredSkills')} htmlFor="skills">
          <input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        <button type="submit">{t('common.search')}</button>
      </form>

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState message={t('job.empty')} />
      ) : (
        <>
          <div className="grid cols-2">
            {query.data!.items.map((job) => (
              <article key={job.id} className="card" data-testid="job-card">
                <h2 style={{ margin: '0 0 0.25rem' }}>
                  <Link to={`/jobs/${job.id}`}>{job.title}</Link>
                </h2>
                <p className="muted">
                  {job.companyName} · {t(`job.workStyleValue.${job.workStyle}`)}
                  {job.location ? ` · ${job.location}` : ''}
                </p>
                <div>
                  {job.requiredSkills.slice(0, 6).map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <Pagination data={query.data!} page={page} setPage={setPage} />
        </>
      )}
    </section>
  );
}

export function Pagination<T>({
  data,
  page,
  setPage,
}: {
  data: Paginated<T>;
  page: number;
  setPage: (p: number) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="row" style={{ justifyContent: 'center' }}>
      <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        {t('common.back')}
      </button>
      <span>{t('common.page', { page: data.page, total: data.totalPages })}</span>
      <button
        type="button"
        className="secondary"
        disabled={page >= data.totalPages}
        onClick={() => setPage(page + 1)}
      >
        {t('common.view')}
      </button>
    </div>
  );
}
