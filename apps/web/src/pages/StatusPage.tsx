import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Card } from '../design';

export function StatusPage({
  code,
  title,
  body,
  actions,
}: {
  code: string;
  title: string;
  body: string;
  actions?: ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <Card style={{ textAlign: 'center', maxWidth: 480 }}>
        <div
          aria-hidden="true"
          style={{
            fontSize: 'var(--text-3xl)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--color-text-subtle)',
          }}
        >
          {code}
        </div>
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {actions ?? (
            <Button asChild>
              <Link to="/">{t('errorPage.goHome')}</Link>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
