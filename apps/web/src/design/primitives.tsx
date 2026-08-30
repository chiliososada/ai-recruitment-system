import * as Avatar from '@radix-ui/react-avatar';
import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  asChild?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    asChild = false,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const cls = ['ui-btn', variantClass[variant], size === 'sm' ? 'sm' : '', className]
    .filter(Boolean)
    .join(' ');
  if (asChild) {
    return (
      <Slot className={cls} ref={ref} {...rest}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  function IconButton({ label, className, children, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        className={['ui-icon-btn', className].filter(Boolean).join(' ')}
        aria-label={label}
        {...rest}
      >
        {children}
      </Button>
    );
  },
);

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={['ui-card', className].filter(Boolean).join(' ')} {...rest} />;
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-card ui-stat">
      <span className="ui-stat-value">{value}</span>
      <span className="ui-stat-label">{label}</span>
      {hint ? (
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}): JSX.Element {
  return <span className={`ui-badge ${tone === 'neutral' ? '' : tone}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return <span className="ui-spinner" role="status" aria-label={label ?? 'Loading'} />;
}

export function Skeleton({
  width,
  height = 16,
}: {
  width?: number | string;
  height?: number | string;
}): JSX.Element {
  return (
    <span
      className="ui-skeleton"
      aria-hidden="true"
      style={{ display: 'block', width: width ?? '100%', height }}
    />
  );
}

export function InlineAlert({
  tone = 'info',
  children,
  role = 'status',
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  role?: 'status' | 'alert';
}): JSX.Element {
  return (
    <div className={`ui-alert ${tone}`} role={role}>
      {children}
    </div>
  );
}

export function UserAvatar({ name }: { name: string }): JSX.Element {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <Avatar.Root
      style={{
        display: 'inline-flex',
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-primary-soft)',
        color: 'var(--color-primary)',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
      }}
    >
      <Avatar.Fallback aria-label={name}>{initials || '?'}</Avatar.Fallback>
    </Avatar.Root>
  );
}

/** Deterministic hue from a string — stable, pleasant gradient per entity. */
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/**
 * Colored-initial avatar for companies/candidates. The gradient is derived from the
 * name, so every entity gets a stable, distinct identity mark without images.
 */
export function InitialAvatar({
  name,
  size = 'md',
  round = false,
}: {
  name: string;
  size?: 'md' | 'lg';
  round?: boolean;
}): JSX.Element {
  const hue = hashHue(name || '?');
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('');
  const cls = ['ui-avatar-mark', size === 'lg' ? 'lg' : '', round ? 'round' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span
      aria-hidden="true"
      className={cls}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 64% 52%), hsl(${(hue + 42) % 360} 64% 40%))`,
      }}
    >
      {initials}
    </span>
  );
}

/** SVG donut score indicator (0–100) with the brand gradient stroke. */
export function ScoreRing({ value, size = 56 }: { value: number; size?: number }): JSX.Element {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = size >= 56 ? 5 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gid = `sr-${size}`;
  return (
    <span
      className="score-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${v}/100`}
    >
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--indigo-500)" />
            <stop offset="100%" stopColor="var(--violet-500)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
        />
      </svg>
      <span
        className="score-ring-num"
        style={{ fontSize: size >= 56 ? 'var(--text-base)' : 'var(--text-xs)' }}
      >
        {v}
      </span>
    </span>
  );
}
