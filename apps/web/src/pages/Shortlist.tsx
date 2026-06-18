import { useState } from 'react';
import type { ComparisonResult, ShortlistEntry } from '@ars/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { CompareTable } from '../components/CompareTable';
import { EmptyState, ErrorState, Loading } from '../components/ui';

export default function Shortlist(): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  const list = useQuery({ queryKey: ['shortlist'], queryFn: () => api.get<ShortlistEntry[]>('/shortlists') });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/shortlists/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shortlist'] }),
  });
  const compare = useMutation({
    mutationFn: () => api.post<ComparisonResult>('/compare', { candidateIds: selected }),
    onSuccess: setComparison,
  });

  function toggle(candidateId: string): void {
    setSelected((prev) =>
      prev.includes(candidateId) ? prev.filter((x) => x !== candidateId) : [...prev, candidateId],
    );
  }

  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const items = list.data ?? [];

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('shortlist.title')}</h1>
        <button type="button" disabled={selected.length < 2} onClick={() => compare.mutate()}>
          {t('shortlist.compare')} ({selected.length})
        </button>
      </div>
      {selected.length === 1 ? <p className="muted">{t('shortlist.selectAtLeastTwo')}</p> : null}

      {items.length === 0 ? (
        <EmptyState message={t('shortlist.empty')} />
      ) : (
        <ul className="list-reset stack">
          {items.map((s) => (
            <li key={s.id} className="card row" style={{ justifyContent: 'space-between' }}>
              <label className="row">
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={selected.includes(s.candidateId)}
                  onChange={() => toggle(s.candidateId)}
                  aria-label={`${t('shortlist.compare')} ${s.candidateName ?? ''}`}
                />
                <Link to={`/talent/${s.candidateId}`}>{s.candidateName ?? s.candidateId}</Link>
                {s.candidateHeadline ? <span className="muted"> — {s.candidateHeadline}</span> : null}
              </label>
              <button type="button" className="danger" onClick={() => remove.mutate(s.id)}>
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {comparison ? <CompareTable result={comparison} /> : null}
    </section>
  );
}
