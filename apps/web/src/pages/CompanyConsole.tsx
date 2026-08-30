import { useState } from 'react';
import { COMPANY_SIZES, type Company, type CompanySize } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { localizeError } from '../lib/errors';
import { EmptyState, ErrorState, Field, Loading } from '../components/ui';
import { Icons, InitialAvatar } from '../design';

export default function CompanyConsole(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const companies = useQuery({
    queryKey: ['my-companies'],
    queryFn: () => api.get<Company[]>('/companies/mine'),
  });

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState<CompanySize | ''>('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<unknown>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<Company>('/companies', { name, industry, size: size || undefined, location }),
    onSuccess: () => {
      setName('');
      setIndustry('');
      setLocation('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['my-companies'] });
    },
    onError: setError,
  });

  return (
    <section className="grid cols-2">
      <div>
        <div className="page-header">
          <h1>{t('nav.console')}</h1>
        </div>
        {companies.isLoading ? (
          <Loading />
        ) : companies.error ? (
          <ErrorState error={companies.error} onRetry={() => companies.refetch()} />
        ) : (companies.data?.length ?? 0) === 0 ? (
          <EmptyState message={t('company.empty')} />
        ) : (
          <ul className="list-reset stack">
            {companies.data!.map((c) => (
              <li key={c.id} className="card card-hover">
                <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-3)' }}>
                  <InitialAvatar name={c.name} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link to={`/console/companies/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                    <div className="meta-row" style={{ marginTop: 2 }}>
                      {c.industry ? <span className="meta-item">{c.industry}</span> : null}
                      <span className="meta-item">
                        <Icons.Briefcase size={13} aria-hidden="true" />
                        {t('company.openJobs')}: {c.openJobCount ?? 0}
                      </span>
                    </div>
                  </div>
                  <Icons.ChevronRight
                    size={18}
                    aria-hidden="true"
                    style={{ color: 'var(--color-text-subtle)' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2>{t('company.create')}</h2>
        <Field label={t('company.name')} htmlFor="name">
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
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
            <option value="">{t('common.none')}</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('company.location')} htmlFor="location">
          <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        {error ? (
          <div className="field-error" role="alert">
            {localizeError(t, error)}
          </div>
        ) : null}
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : t('company.create')}
        </button>
      </form>
    </section>
  );
}
