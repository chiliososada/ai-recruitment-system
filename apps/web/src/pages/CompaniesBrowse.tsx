import { useState } from 'react';
import { COMPANY_SIZES, type Company, type CompanySize, type Paginated } from '@ars/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { qs } from '../lib/qs';
import { EmptyState, ErrorState, Field, Loading } from '../components/ui';
import { Icons, InitialAvatar } from '../design';
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
      api.get<Paginated<Company>>(
        `/companies${qs({ q, industry, size: size || undefined, page })}`,
      ),
  });

  return (
    <section className="stack">
      <div className="page-header">
        <h1>{t('company.list')}</h1>
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
        <Field label={t('company.industry')} htmlFor="industry">
          <input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
        <Field label={t('company.size')} htmlFor="size">
          <select
            id="size"
            value={size}
            onChange={(e) => setSize(e.target.value as CompanySize | '')}
          >
            <option value="">{t('common.all')}</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
        <EmptyState message={t('company.empty')} />
      ) : (
        <>
          <div className="grid cols-2">
            {query.data!.items.map((c) => (
              <article key={c.id} className="card" data-testid="company-card">
                <div
                  className="row"
                  style={{ gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
                >
                  <InitialAvatar name={c.name} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
                      <Link to={`/companies/${c.id}`}>{c.name}</Link>
                    </h2>
                    <div className="meta-row" style={{ marginTop: 4 }}>
                      {c.industry ? <span className="meta-item">{c.industry}</span> : null}
                      {c.size ? (
                        <span className="meta-item">
                          <Icons.Users size={14} aria-hidden="true" />
                          {c.size}
                        </span>
                      ) : null}
                      {c.location ? (
                        <span className="meta-item">
                          <Icons.MapPin size={14} aria-hidden="true" />
                          {c.location}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <span
                  className={`ui-badge ${(c.openJobCount ?? 0) > 0 ? 'success' : ''}`}
                  style={{ marginTop: 'var(--space-3)' }}
                >
                  <Icons.Briefcase size={12} aria-hidden="true" />
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
