import { useState } from 'react';
import { LOCALES, type Locale } from '@ars/shared';
import { useTranslation } from 'react-i18next';
import { changeLocale } from '../i18n';
import { useAuth } from '../lib/auth';
import { localizeError } from '../lib/errors';
import { Badge, Field } from '../components/ui';

export default function AccountSettings(): JSX.Element {
  const { t } = useTranslation();
  const { user, updateAccount } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [locale, setLocale] = useState<Locale>(user?.locale ?? 'ja');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await updateAccount({ displayName, locale, ...(password ? { password } : {}) });
      await changeLocale(locale);
      setPassword('');
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 520, margin: '1rem auto' }}>
      <h1>{t('auth.accountSettings')}</h1>
      <p>
        {user?.email}{' '}
        <Badge>{user?.emailVerified ? t('auth.verified') : t('auth.notVerified')}</Badge>
      </p>
      <form onSubmit={submit} noValidate>
        <Field label={t('auth.displayName')} htmlFor="displayName">
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label={t('locale.label')} htmlFor="locale">
          <select id="locale" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {t(`locale.${l}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('auth.newPassword')} htmlFor="password" hint={t('common.optional')}>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? (
          <div className="field-error" role="alert">
            {localizeError(t, error)}
          </div>
        ) : null}
        {done ? (
          <div role="status" className="muted">
            {t('common.save')} ✓
          </div>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('auth.updateAccount')}
        </button>
      </form>
    </section>
  );
}
