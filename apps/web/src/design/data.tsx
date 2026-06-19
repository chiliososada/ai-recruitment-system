import type { Paginated } from '@ars/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from './feedback';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

/**
 * Responsive data table. On narrow viewports each row becomes a labelled card
 * (`data-label` + CSS), so data is readable on mobile without horizontal scroll (§4.4).
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyMessage,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  caption: string;
  emptyMessage?: string;
}): JSX.Element {
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;
  return (
    <div className="ui-table-wrap">
      <table className="ui-table ui-responsive-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  data-label={col.header}
                  style={{ textAlign: col.align ?? 'left' }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}): JSX.Element {
  return (
    <form
      className="ui-card ui-filterbar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
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
    <nav className="row" style={{ justifyContent: 'center' }} aria-label="pagination">
      <button
        type="button"
        className="ui-btn secondary sm"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        {t('common.back')}
      </button>
      <span aria-live="polite">
        {t('common.page', { page: data.page, total: data.totalPages })}
      </span>
      <button
        type="button"
        className="ui-btn secondary sm"
        disabled={page >= data.totalPages}
        onClick={() => setPage(page + 1)}
      >
        {t('common.next')}
      </button>
    </nav>
  );
}
