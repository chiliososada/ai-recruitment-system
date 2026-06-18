import { useState } from 'react';
import { USER_ROLES, type Locale, type UserRole } from '@ars/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { localizeError, localizeFieldErrors } from '../lib/errors';
import { Field } from '../components/ui';

export default function Register(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('job_seeker');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const fieldErrors = localizeFieldErrors(t, error);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await register({
        email,
        password,
        displayName,
        role,
        locale: i18n.language as Locale,
      });
      navigate('/verify', { state: { token: session.devEmailVerificationToken, role } });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 460, margin: '2rem auto' }}>
      <h1>{t('auth.registerTitle')}</h1>
      <form onSubmit={submit} noValidate>
        <Field label={t('auth.role')} htmlFor="role">
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'job_seeker' ? t('auth.roleSeeker') : t('auth.roleCompany')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('auth.displayName')} htmlFor="displayName">
          <input
            id="displayName"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label={t('auth.email')} htmlFor="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('auth.passwordLabel')} htmlFor="password" error={fieldErrors.password}>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && Object.keys(fieldErrors).length === 0 ? (
          <div className="field-error" role="alert">
            {localizeError(t, error)}
          </div>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('auth.signUp')}
        </button>
      </form>
      <p className="muted">
        {t('auth.alreadyHaveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
      </p>
    </section>
  );
}
