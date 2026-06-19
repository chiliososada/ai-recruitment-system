import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeError } from '../lib/errors';
import { Button, Skeleton, Spinner } from './primitives';

export function Loading({ label }: { label?: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="state" role="status" aria-live="polite">
      <Spinner />
      <div style={{ marginTop: 'var(--space-2)' }}>{label ?? t('common.loading')}</div>
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={56} />
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  action,
  icon,
}: {
  message?: string;
  action?: ReactNode;
  icon?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="ui-empty">
      <span aria-hidden="true" style={{ color: 'var(--color-text-subtle)' }}>
        {icon ?? <Inbox size={32} />}
      </span>
      <p style={{ margin: 0 }}>{message ?? t('common.empty')}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="ui-empty" role="alert">
      <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}>
        <AlertCircle size={32} />
      </span>
      <p style={{ margin: 0 }}>{localizeError(t, error)}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
