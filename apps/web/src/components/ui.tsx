import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeError } from '../lib/errors';

export function Loading(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="state" role="status" aria-live="polite">
      {t('common.loading')}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }): JSX.Element {
  const { t } = useTranslation();
  return <div className="state">{message ?? t('common.empty')}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="state" role="alert">
      <p>{localizeError(t, error)}</p>
      {onRetry && (
        <button type="button" className="secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}

export function Field({ label, htmlFor, error, children, hint }: FieldProps): JSX.Element {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="muted" style={{ fontSize: '0.8rem' }}>{hint}</div>}
      {error && (
        <div className="field-error" id={`${htmlFor}-error`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function Badge({ children, variant }: { children: ReactNode; variant?: 'rec' }): JSX.Element {
  return <span className={variant === 'rec' ? 'badge rec' : 'badge'}>{children}</span>;
}
