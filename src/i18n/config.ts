import type { i18n, ResourceLanguage } from 'i18next';
import english from './locales/en.json';
import registry from './locales.json';
import review from './review-status.json';
import offers from '@/config/offers.json';
import { fingerprint, isLocaleReleased, type LocaleCode } from './locale-policy.mjs';
import { createLocaleInstance } from './instance';

export { registry, review };
export type { LocaleCode };
export const locales = registry.locales.filter(locale => locale.wave <= 1);
export const sourceFingerprint = fingerprint({ english, offers });
export const sourceDocuments: Record<string, string> = typeof __FABSY_LEGAL_SOURCE_HASHES__ === 'undefined' ? {} : __FABSY_LEGAL_SOURCE_HASHES__;
export const translationValues = {
  price: `$${offers.rapidResolution.priceCad}`,
  reportPrice: `$${offers.insuranceReport.priceCad}`,
  bundlePrice: `$${offers.bundle.priceCad}`,
  email: 'hello@fabsy.ca',
};

const loaders = import.meta.glob<{ default: ResourceLanguage }>(['./locales/*.json', '!./locales/en.json']);
const bundles = new Map<string, ResourceLanguage>([['en', english]]);
const instances = new Map<string, i18n>();
const pending = new Map<string, Promise<i18n>>();

function makeInstance(locale: LocaleCode, bundle: ResourceLanguage) {
  const instance = createLocaleInstance(locale, english, bundle, locales.map(item => item.code), translationValues);
  instances.set(locale, instance);
  return instance;
}

export const englishInstance = makeInstance('en', english);

export function getLocaleInstance(locale: LocaleCode) {
  return instances.get(locale);
}

export function loadLocale(locale: LocaleCode): Promise<i18n> {
  const ready = instances.get(locale);
  if (ready) return Promise.resolve(ready);
  const existing = pending.get(locale);
  if (existing) return existing;
  const loader = loaders[`./locales/${locale}.json`];
  if (!loader) return Promise.reject(new Error(`Translation unavailable: ${locale}`));
  const promise = loader().then(module => {
    bundles.set(locale, module.default);
    return makeInstance(locale, module.default);
  }).finally(() => pending.delete(locale));
  pending.set(locale, promise);
  return promise;
}

export function localeIsReleased(locale: LocaleCode) {
  const bundle = bundles.get(locale);
  return isLocaleReleased(locale, review, {
    sourceVersion: registry.sourceVersion,
    sourceFingerprint,
    bundleFingerprint: bundle ? fingerprint(bundle) : '',
    sourceDocuments,
  });
}

// Unreviewed dictionaries remain lazy. Only an approved candidate needs loading
// to check its fingerprint before it can be offered as a public language.
export async function loadReleaseCandidates() {
  const candidates = Object.entries(review.locales)
    .filter(([, entry]) => entry.status === 'approved')
    .map(([code]) => loadLocale(code as LocaleCode));
  await Promise.allSettled(candidates);
}
