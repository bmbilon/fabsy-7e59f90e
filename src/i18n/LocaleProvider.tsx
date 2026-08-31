import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { englishInstance, getLocaleInstance, loadLocale, loadReleaseCandidates, localeIsReleased, locales, registry, type LocaleCode } from './config';
import { localizePath, splitLocalePath } from './locale-policy.mjs';
import { LocaleContext, type IntakeHandoff } from './locale-context';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, path: basePath } = splitLocalePath(location.pathname);
  const [loaded, setLoaded] = useState(() => getLocaleInstance(locale));
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [, refreshReleases] = useState(0);
  const [intakeHandoff, setIntakeHandoff] = useState<IntakeHandoff | null>(null);
  const instance = getLocaleInstance(locale) || (loaded?.language === locale ? loaded : undefined);
  const metadata = locales.find(item => item.code === locale)!;
  const direction = metadata.dir as 'ltr' | 'rtl';

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(null);
    loadLocale(locale).then(result => {
      if (!cancelled) setLoaded(result);
    }).catch(() => {
      if (!cancelled) setLoadFailed(locale);
    });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void loadReleaseCandidates().then(() => {
      if (!cancelled) refreshReleases(value => value + 1);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (basePath !== '/submit-ticket' && basePath !== '/ticket-form') setIntakeHandoff(null);
  }, [basePath]);

  useLayoutEffect(() => {
    document.documentElement.lang = metadata.languageTag;
    document.documentElement.dir = direction;
    return () => {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
    };
  }, [metadata.languageTag, direction]);

  const isReleased = localeIsReleased(locale);
  const availableLocales = locales.filter(item =>
    import.meta.env.DEV || item.code === locale || localeIsReleased(item.code as LocaleCode),
  );

  // Do not briefly render English legal copy under a translated URL while its
  // bundle is loading, or leave the previous locale active on back navigation.
  if (!instance) {
    const englishFallback = localizePath(location.pathname + location.search + location.hash, 'en');
    return (
      <main className="grid min-h-screen place-content-center gap-5 px-6 text-center" lang="en" dir="ltr">
        <p role="status">{loadFailed === locale ? 'This translation could not be loaded.' : 'Loading…'}</p>
        {loadFailed === locale && (basePath === '/thank-you' && new URLSearchParams(location.search).has('session_id')
          ? <button type="button" className="text-primary underline" onClick={() => navigate(englishFallback)}>Continue in English</button>
          : <a className="text-primary underline" href={englishFallback}>Continue in English</a>)}
      </main>
    );
  }

  return (
    <LocaleContext.Provider value={{ locale, basePath, isReleased, direction, availableLocales, intakeHandoff, setIntakeHandoff, href: path => {
      const clean = splitLocalePath(path.split(/[?#]/)[0]).path;
      // Never invent locale-prefixed blog, portal or Wave 2 routes.
      return registry.phase1Routes.includes(clean) ? localizePath(path, locale) : localizePath(path, 'en');
    } }}>
      <I18nextProvider i18n={instance || englishInstance}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  );
}
