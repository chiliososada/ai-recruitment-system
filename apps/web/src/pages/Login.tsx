import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { Field } from '../components/ui';

export default function Login(): JSX.Element {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login({ email, password });
      navigate(user.role === 'company_member' ? '/console' : '/me');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
      <h1>{t('auth.loginTitle')}</h1>
      <form onSubmit={submit} noValidate>
        <Field label={t('auth.email')} htmlFor="email">
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.passwordLabel')} htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? (
          <div className="field-error" role="alert">
            {localizeError(t, error)}
          </div>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('auth.signIn')}
        </button>
      </form>
      <p className="muted">
        {t('auth.noAccount')} <Link to="/register">{t('auth.signUp')}</Link>
      </p>
    </section>
  );
}
