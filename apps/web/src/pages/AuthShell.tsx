import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icons } from '../design';

/** Split auth layout: brand value panel (hidden on mobile) + form card. */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  const points = ['propAnalysisD', 'propScoreD', 'propLangD'] as const;
  return (
    <div className="auth-layout">
      <aside className="auth-brand">
        <div>
          <div className="brand" style={{ padding: 0, color: '#fff' }}>
            <span className="brand-mark">
              <Icons.Sparkles size={18} aria-hidden="true" />
            </span>
            {t('common.appName')}
          </div>
          <h2 style={{ marginTop: 'var(--space-6)' }}>{t('home.heroTitle1')}</h2>
          <p>{t('home.heroSub')}</p>
        </div>
        <div>
          {points.map((k) => (
            <div className="auth-point" key={k}>
              <Icons.ShieldCheck size={18} aria-hidden="true" />
              <span>{t(`home.${k}`)}</span>
            </div>
          ))}
        </div>
      </aside>
      <section className="auth-card">
        <h1 style={{ marginBottom: 'var(--space-5)' }}>{title}</h1>
        {children}
      </section>
    </div>
  );
}
