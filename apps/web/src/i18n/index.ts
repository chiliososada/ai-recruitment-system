import { DEFAULT_LOCALE, LOCALES, type Locale } from '@ars/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ja from './locales/ja';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';

export const LOCALE_STORAGE_KEY = 'ars.locale';

export const resources = {
  en: { translation: en },
  ja: { translation: ja },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
} as const;

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
  });

if (typeof document !== 'undefined') {
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
  });
}

export function changeLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
}

export default i18n;
