/**
 * Backward-compatible shim → the design system in `src/design`. Existing pages import
 * { Loading, EmptyState, ErrorState, Field, Badge } from here; new code should import from
 * `../design`.
 */
import type { ReactNode } from 'react';
import { Badge as DSBadge } from '../design/primitives';

export { Loading, EmptyState, ErrorState } from '../design/feedback';
export { FormField as Field } from '../design/form';

/** Page title with a one-line explanation of what the page is for, plus optional actions. */
export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div
      className="page-header row"
      style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {desc ? (
          <p className="muted page-desc" style={{ margin: 'var(--space-2) 0 0' }}>
            {desc}
          </p>
        ) : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: 'rec' | 'success' | 'warning' | 'danger' | 'info';
}): JSX.Element {
  const tone = variant === 'rec' ? 'success' : (variant ?? 'neutral');
  return <DSBadge tone={tone}>{children}</DSBadge>;
}
