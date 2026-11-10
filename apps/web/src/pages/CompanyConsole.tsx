import { useState } from 'react';
import { COMPANY_SIZES, type Company, type CompanySize } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { localizeError } from '../lib/errors';
import { ErrorState, Field, Loading, PageHeader } from '../components/ui';
import { Icons, InitialAvatar } from '../design';

export default function CompanyConsole(): JSX.Element {
  const { t } = useTranslation();
  const companies = useQuery({
    queryKey: ['my-companies'],
    queryFn: () => api.get<Company[]>('/companies/mine'),
  });
  const [showCreate, setShowCreate] = useState(false);

  if (companies.isLoading) return <Loading />;
  if (companies.error) {
    return <ErrorState error={companies.error} onRetry={() => companies.refetch()} />;
  }
  const list = companies.data ?? [];
  const hasCompany = list.length > 0;

  return (
    <section className="stack">
      <PageHeader
        title={t('nav.console')}
        desc={t('pageDesc.console')}
        actions={
          hasCompany && !showCreate ? (
            <button type="button" className="secondary" onClick={() => setShowCreate(true)}>
              <Icons.Plus size={16} aria-hidden="true" />
              {t('company.createAnother')}
            </button>
          ) : null
        }
      />
      <div className="grid cols-2">
        <div className="stack">
          {hasCompany ? (
            <>
              <div>
                <h2 style={{ marginBottom: 'var(--space-1)' }}>{t('company.yours')}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {t('company.selectHint')}
                </p>
              </div>
              <ul className="list-reset stack">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/console/companies/${c.id}`}
                      className="card card-hover"
                      style={{ display: 'block', color: 'inherit' }}
                    >
                      <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-3)' }}>
                        <InitialAvatar name={c.name} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong>{c.name}</strong>
                          <div className="meta-row" style={{ marginTop: 2 }}>
                            {c.industry ? <span className="meta-item">{c.industry}</span> : null}
                            <span className="meta-item">
                              <Icons.Briefcase size={13} aria-hidden="true" />
                              {t('company.openJobsCount', { count: c.openJobCount ?? 0 })}
                            </span>
                          </div>
                        </div>
                        <Icons.ChevronRight
                          size={18}
                          aria-hidden="true"
                          style={{ color: 'var(--color-text-subtle)' }}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="card">
              <p style={{ margin: 0 }}>{t('company.firstStep')}</p>
            </div>
          )}
        </div>

        {!hasCompany || showCreate ? (
          <CreateCompanyForm onDone={() => setShowCreate(false)} canCancel={hasCompany} />
        ) : null}
      </div>
    </section>
  );
}

function CreateCompanyForm({
  onDone,
  canCancel,
}: {
  onDone: () => void;
  canCancel: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
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
      onDone();
    },
    onError: setError,
  });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h2>{t('company.createTitle')}</h2>
      <Field label={t('company.name')} htmlFor="name">
        <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('company.industry')} htmlFor="industry">
        <input
          id="industry"
          value={industry}
          placeholder={t('company.industryPlaceholder')}
          onChange={(e) => setIndustry(e.target.value)}
        />
      </Field>
      <Field label={t('company.size')} htmlFor="size">
        <select
          id="size"
          value={size}
          onChange={(e) => setSize(e.target.value as CompanySize | '')}
        >
          <option value="">{t('company.sizeAny')}</option>
          {COMPANY_SIZES.map((s) => (
            <option key={s} value={s}>
              {t(`company.sizeValue.${s}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('company.location')} htmlFor="location">
        <input
          id="location"
          value={location}
          placeholder={t('job.locationPlaceholder')}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      {error ? (
        <div className="field-error" role="alert">
          {localizeError(t, error)}
        </div>
      ) : null}
      <div className="row">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? t('common.saving') : t('company.create')}
        </button>
        {canCancel ? (
          <button type="button" className="ghost" onClick={onDone}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
    </form>
  );
}
