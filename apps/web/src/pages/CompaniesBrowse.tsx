import { useState } from 'react';
import { COMPANY_SIZES, type Company, type CompanySize, type Paginated } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { qs } from '../lib/qs';
import { EmptyState, ErrorState, Field, Loading } from '../components/ui';
import { Pagination } from './JobsBrowse';

export default function CompaniesBrowse(): JSX.Element {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState<CompanySize | ''>('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['companies', q, industry, size, page],
    queryFn: () =>
      api.get<Paginated<Company>>(`/companies${qs({ q, industry, size: size || undefined, page })}`),
  });

  return (
    <section className="stack">
      <h1>{t('company.list')}</h1>
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
        <Field label={t('company.industry')} htmlFor="industry">
          <input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
        <Field label={t('company.size')} htmlFor="size">
          <select id="size" value={size} onChange={(e) => setSize(e.target.value as CompanySize | '')}>
            <option value="">{t('common.all')}</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit">{t('common.search')}</button>
      </form>

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState message={t('company.empty')} />
      ) : (
        <>
          <div className="grid cols-2">
            {query.data!.items.map((c) => (
              <article key={c.id} className="card" data-testid="company-card">
                <h2 style={{ margin: '0 0 0.25rem' }}>
                  <Link to={`/companies/${c.id}`}>{c.name}</Link>
                </h2>
                <p className="muted">
                  {c.industry ?? ''} {c.size ? `· ${c.size}` : ''} {c.location ? `· ${c.location}` : ''}
                </p>
                <span className="badge">
                  {t('company.openJobs')}: {c.openJobCount ?? 0}
                </span>
              </article>
            ))}
          </div>
          <Pagination data={query.data!} page={page} setPage={setPage} />
        </>
      )}
    </section>
  );
}
