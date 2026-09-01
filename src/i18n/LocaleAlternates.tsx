import { useEffect } from 'react';
import { useLocale } from './locale-context';
import { localeIsIndexable, locales, registry, type LocaleCode } from './config';
import { localizePath } from './locale-policy.mjs';

export default function LocaleAlternates() {
  const { locale, basePath } = useLocale();
  const isIndexable = localeIsIndexable(locale);
  const indexableLocales = locales.filter(item => localeIsIndexable(item.code as LocaleCode)).map(item => item.code).join(',');
  useEffect(() => {
    if (!isIndexable || !registry.indexableRoutes.includes(basePath)) return;
    const links: HTMLLinkElement[] = [];
    const add = (language: string, path: string) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = language;
      link.href = `https://fabsy.ca${path}`;
      link.dataset.fabsyLocale = 'true';
      document.head.appendChild(link);
      links.push(link);
    };
    for (const item of locales) {
      if (localeIsIndexable(item.code as LocaleCode)) add(item.languageTag, localizePath(basePath, item.code));
    }
    add('x-default', basePath);
    return () => links.forEach(link => link.remove());
  }, [locale, basePath, isIndexable, indexableLocales]);
  return null;
}
