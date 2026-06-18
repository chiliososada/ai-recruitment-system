import { useState } from 'react';
import type { UserRole } from '@ars/shared';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { Field } from '../components/ui';

export default function VerifyEmail(): JSX.Element {
  const { t } = useTranslation();
  const { verifyEmail, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { token?: string; role?: UserRole };
  const [token, setToken] = useState(state.token ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(token);
      const role = state.role ?? user?.role;
      navigate(role === 'company_member' ? '/console' : '/me');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 460, margin: '2rem auto' }}>
      <h1>{t('auth.verifyEmailTitle')}</h1>
      <p className="muted">{t('auth.verifyEmailHint')}</p>
      {state.token ? (
        <p className="muted" data-testid="dev-token">
          {t('auth.devTokenHint')} <code>{state.token}</code>
        </p>
      ) : null}
      <form onSubmit={submit} noValidate>
        <Field label={t('auth.verifyEmailTitle')} htmlFor="token">
          <input id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
        {error ? (
          <div className="field-error" role="alert">
            {localizeError(t, error)}
          </div>
        ) : null}
        <div className="row">
          <button type="submit" disabled={busy}>
            {t('auth.verifyEmailButton')}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => navigate((state.role ?? user?.role) === 'company_member' ? '/console' : '/me')}
          >
            {t('common.back')}
          </button>
        </div>
      </form>
    </section>
  );
}
