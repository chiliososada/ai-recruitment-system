/**
 * Backward-compatible shim → the design system in `src/design`. Existing pages import
 * { Loading, EmptyState, ErrorState, Field, Badge } from here; new code should import from
 * `../design`.
 */
import type { ReactNode } from 'react';
import { Badge as DSBadge } from '../design/primitives';

export { Loading, EmptyState, ErrorState } from '../design/feedback';
export { FormField as Field } from '../design/form';

export function Badge({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: 'rec';
}): JSX.Element {
  return <DSBadge tone={variant === 'rec' ? 'success' : 'neutral'}>{children}</DSBadge>;
}
