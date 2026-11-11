import { useState } from 'react';
import {
  MATCH_MIN_SCORE,
  type Company,
  type ComparisonResult,
  type Job,
  type Paginated,
  type TalentSummary,
} from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { qs } from '../lib/qs';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader } from '../components/ui';
import { Icons, InitialAvatar, ScoreRing } from '../design';
import { CompareTable } from '../components/CompareTable';
import { Pagination } from './JobsBrowse';

export default function TalentSearch(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const jobId = params.get('job') ?? undefined;
  const [q, setQ] = useState('');
  const [minYears, setMinYears] = useState('');
  const [skills, setSkills] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  // "jobId:candidateId" pairs added to the shortlist on this page.
  const [added, setAdded] = useState<string[]>([]);

  // The company's open jobs, for scoring the list against one of them.
  const jobs = useQuery({
    queryKey: ['talent-job-options'],
    queryFn: async () => {
      const companies = await api.get<Company[]>('/companies/mine');
      const lists = await Promise.all(
        companies.map((c) => api.get<Job[]>(`/companies/${c.id}/manage/jobs`)),
      );
      return lists.flat().filter((j) => j.status === 'open');
    },
  });

  const talent = useQuery({
    queryKey: ['talent', q, minYears, skills, page, jobId],
    queryFn: () =>
      api.get<Paginated<TalentSummary>>(
        `/talent${qs({ q, minYears: minYears || undefined, skills, page, recommendedForJobId: jobId })}`,
      ),
  });

  const shortlist = useMutation({
    mutationFn: (candidateId: string) => api.post('/shortlists', { candidateId, jobId }),
    onSuccess: (_res, candidateId) => {
      setAdded((prev) => [...prev, `${jobId ?? ''}:${candidateId}`]);
      void qc.invalidateQueries({ queryKey: ['shortlist'] });
    },
  });

  function chooseJob(next: string): void {
    setParams(next ? { job: next } : {});
    setPage(1);
    // A comparison is scored against one job; start over when the job changes.
    setSelected([]);
    setComparison(null);
  }

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
      <PageHeader title={t('talent.title')} desc={t('pageDesc.talent')} />
      <form
        className="card ui-filterbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void talent.refetch();
        }}
      >
        {/* Wider than the other filters so long job titles stay readable. */}
        <div style={{ flex: '2 1 300px', minWidth: 0 }}>
          <Field label={t('talent.job')} htmlFor="job">
            <select id="job" value={jobId ?? ''} onChange={(e) => chooseJob(e.target.value)}>
              <option value="">{t('talent.jobNone')}</option>
              {(jobs.data ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('talent.keyword')} htmlFor="q">
          <input
            id="q"
            value={q}
            placeholder={t('talent.keywordPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
          />
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
          <input
            id="skills"
            value={skills}
            placeholder={t('talent.skillsPlaceholder')}
            onChange={(e) => setSkills(e.target.value)}
          />
        </Field>
        <button type="submit">
          <Icons.Search size={16} aria-hidden="true" />
          {t('common.search')}
        </button>
      </form>

      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }} data-testid="job-hint">
        {t(jobId ? 'talent.jobHintActive' : 'talent.jobHint', { min: MATCH_MIN_SCORE })}
      </p>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{t('talent.count', { count: talent.data?.total ?? 0 })}</span>
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
                        <Link to={`/talent/${c.id}${jobId ? `?job=${jobId}` : ''}`}>
                          {c.displayName}
                        </Link>
                      </h2>
                      {c.recommended ? (
                        <Badge variant="rec">{t('talent.recommended')}</Badge>
                      ) : null}
                    </div>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 'var(--text-sm)' }}>
                      {c.headline ? `${c.headline} · ` : ''}
                      {t('analysis.experience', { count: c.yearsExperience })}
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
                      aria-label={`${t('talent.compareToggle')} ${c.displayName}`}
                    />
                    {t('talent.compareToggle')}
                  </label>
                  {added.includes(`${jobId ?? ''}:${c.id}`) ? (
                    <button type="button" className="secondary" disabled>
                      <Icons.Check size={16} aria-hidden="true" />
                      {t('shortlist.added')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      disabled={shortlist.isPending && shortlist.variables === c.id}
                      onClick={() => shortlist.mutate(c.id)}
                    >
                      {t('shortlist.add')}
                    </button>
                  )}
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
