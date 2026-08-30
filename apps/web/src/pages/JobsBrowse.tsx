import { useState } from 'react';
import { WORK_STYLES, type Job, type Paginated, type WorkStyle } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { qs } from '../lib/qs';
import { EmptyState, ErrorState, Field, Loading } from '../components/ui';
import { JobCard } from '../components/JobCard';
import { Icons } from '../design';

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
      <div className="page-header">
        <h1>{t('job.list')}</h1>
      </div>
      <form
        className="card ui-filterbar"
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
          <select
            id="ws"
            value={workStyle}
            onChange={(e) => setWorkStyle(e.target.value as WorkStyle | '')}
          >
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
        <button type="submit">
          <Icons.Search size={16} aria-hidden="true" />
          {t('common.search')}
        </button>
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
              <JobCard key={job.id} job={job} />
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
      <button
        type="button"
        className="secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        {t('common.back')}
      </button>
      <span>{t('common.page', { page: data.page, total: data.totalPages })}</span>
      <button
        type="button"
        className="secondary"
        disabled={page >= data.totalPages}
        onClick={() => setPage(page + 1)}
      >
        {t('common.next')}
      </button>
    </div>
  );
}
