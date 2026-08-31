import { createInstance, type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LocaleCode } from './locale-policy.mjs';

export function createLocaleInstance(locale: LocaleCode, english: ResourceLanguage, bundle: ResourceLanguage, supportedLngs: string[], variables: Record<string, string>) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs,
    // Route/bundle keys use zh-hans and zh-hant. Without this option i18next
    // canonicalizes the scripts to Hans/Hant and rejects our supported keys.
    lowerCaseLng: true,
    load: 'currentOnly',
    resources: { en: { translation: english }, [locale]: { translation: bundle } },
    interpolation: { escapeValue: false, defaultVariables: variables },
    initAsync: false,
    returnNull: false,
    react: { useSuspense: false },
  });
  return instance;
}
