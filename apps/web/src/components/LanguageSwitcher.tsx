import { LOCALES, type Locale } from '@ars/shared';
import { useTranslation } from 'react-i18next';
import { changeLocale } from '../i18n';

export function LanguageSwitcher(): JSX.Element {
  const { t, i18n } = useTranslation();
  const current = (LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Locale)
    : 'ja';
  return (
    <span className="row">
      <label htmlFor="locale-select" className="visually-hidden">
        {t('locale.label')}
      </label>
      <select
        id="locale-select"
        aria-label={t('locale.switchLanguage' as never, { defaultValue: t('locale.label') })}
        value={current}
        onChange={(e) => changeLocale(e.target.value as Locale)}
        style={{ width: 'auto' }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`locale.${l}`)}
          </option>
        ))}
      </select>
    </span>
  );
}
