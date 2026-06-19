import { DEFAULT_LOCALE, LOCALES, type Locale } from '@ars/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ja from './locales/ja';

export const LOCALE_STORAGE_KEY = 'ars.locale';

// Eager: the fallback chain (ja default + en). The larger zh catalogs are code-split
// into separate chunks and loaded on demand (UI-6, locale lazy-load).
export const resources = {
  ja: { translation: ja },
  en: { translation: en },
} as const;

const lazyLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  'zh-CN': () => import('./locales/zh-CN'),
  'zh-TW': () => import('./locales/zh-TW'),
};

async function ensureBundle(locale: string): Promise<void> {
  if (i18n.hasResourceBundle(locale, 'translation')) return;
  const loader = lazyLoaders[locale];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(locale, 'translation', mod.default, true, true);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: [DEFAULT_LOCALE, 'en'],
    supportedLngs: [...LOCALES],
    load: 'currentOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })
  .then(() => ensureBundle(i18n.language));

if (typeof document !== 'undefined') {
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
  });
}

export async function changeLocale(locale: Locale): Promise<void> {
  await ensureBundle(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
