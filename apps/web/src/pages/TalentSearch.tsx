import { useState } from 'react';
import type { ComparisonResult, Paginated, TalentSummary } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { qs } from '../lib/qs';
import { Badge, EmptyState, ErrorState, Field, Loading } from '../components/ui';
import { Icons, InitialAvatar, ScoreRing } from '../design';
import { CompareTable } from '../components/CompareTable';
import { Pagination } from './JobsBrowse';

export default function TalentSearch(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const jobId = params.get('job') ?? undefined;
  const [q, setQ] = useState('');
  const [minYears, setMinYears] = useState('');
  const [skills, setSkills] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  const talent = useQuery({
    queryKey: ['talent', q, minYears, skills, page, jobId],
    queryFn: () =>
      api.get<Paginated<TalentSummary>>(
        `/talent${qs({ q, minYears: minYears || undefined, skills, page, recommendedForJobId: jobId })}`,
      ),
  });

  const shortlist = useMutation({
    mutationFn: (candidateId: string) => api.post('/shortlists', { candidateId, jobId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shortlist'] }),
  });

  const compare = useMutation({
    mutationFn: () => api.post<ComparisonResult>('/compare', { candidateIds: selected, jobId }),
    onSuccess: setComparison,
  });

  function toggle(idCandidate: string): void {
    setSelected((prev) =>
      prev.includes(idCandidate) ? prev.filter((x) => x !== idCandidate) : [...prev, idCandidate],
    );
  }

  return (
    <section className="stack">
      <div className="page-header">
        <h1>{t('talent.title')}</h1>
      </div>
      <form
        className="card ui-filterbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void talent.refetch();
        }}
      >
        <Field label={t('common.search')} htmlFor="q">
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label={t('talent.minYears')} htmlFor="minYears">
          <input
            id="minYears"
            type="number"
            min={0}
            value={minYears}
            onChange={(e) => setMinYears(e.target.value)}
          />
        </Field>
        <Field label={t('talent.skills')} htmlFor="skills">
          <input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        <button type="submit">
          <Icons.Search size={16} aria-hidden="true" />
          {t('common.search')}
        </button>
      </form>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{t('common.results', { count: talent.data?.total ?? 0 })}</span>
        <button type="button" disabled={selected.length < 2} onClick={() => compare.mutate()}>
          {t('shortlist.compare')} ({selected.length})
        </button>
      </div>

      {talent.isLoading ? (
        <Loading />
      ) : talent.error ? (
        <ErrorState error={talent.error} onRetry={() => talent.refetch()} />
      ) : (talent.data?.items.length ?? 0) === 0 ? (
        <EmptyState message={t('talent.empty')} />
      ) : (
        <>
          <div className="grid cols-2">
            {talent.data!.items.map((c) => (
              <article key={c.id} className="card stack" data-testid="talent-card">
                <div
                  className="row"
                  style={{ gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'nowrap' }}
                >
                  <InitialAvatar name={c.displayName} round />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
                        <Link to={`/talent/${c.id}`}>{c.displayName}</Link>
                      </h2>
                      {c.recommended ? (
                        <Badge variant="rec">{t('talent.recommended')}</Badge>
                      ) : null}
                    </div>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 'var(--text-sm)' }}>
                      {c.headline ? `${c.headline} · ` : ''}
                      {t('analysis.years', { count: c.yearsExperience })}
                    </p>
                  </div>
                  {c.matchScore != null ? (
                    <span aria-label={`${t('match.score')} ${c.matchScore}/100`}>
                      <ScoreRing value={c.matchScore} size={46} />
                    </span>
                  ) : null}
                </div>
                <div>
                  {c.topSkills.slice(0, 6).map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="row">
                  <label className="row">
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={selected.includes(c.id)}
                      onChange={() => toggle(c.id)}
                      aria-label={`${t('shortlist.compare')} ${c.displayName}`}
                    />
                    {t('shortlist.compare')}
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => shortlist.mutate(c.id)}
                  >
                    {t('shortlist.add')}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Pagination data={talent.data!} page={page} setPage={setPage} />
        </>
      )}

      {comparison ? <CompareTable result={comparison} /> : null}
    </section>
  );
}
