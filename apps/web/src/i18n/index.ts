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

/** Keep <html lang> and the tab title in the active language. */
function syncDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = i18n.language;
  const title = i18n.t('meta.title');
  if (title && title !== 'meta.title') document.title = title;
}

// Registered before init(): with inline resources, init emits its first events synchronously.
i18n.on('languageChanged', syncDocument);
i18n.on('loaded', syncDocument);

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
    // The zh catalogs arrive after first render; re-render when a bundle is added so parts of
    // the page that rendered with the fallback (e.g. the top navigation) switch language too.
    react: { bindI18nStore: 'added' },
  })
  .then(() => ensureBundle(i18n.language))
  .then(syncDocument);

export async function changeLocale(locale: Locale): Promise<void> {
  await ensureBundle(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
