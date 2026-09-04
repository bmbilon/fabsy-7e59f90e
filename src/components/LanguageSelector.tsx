import { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useLocale } from '@/i18n/locale-context';
import { loadLocale, registry, type LocaleCode } from '@/i18n/config';
import {
  editorialLanguageHandoffDestination,
  localizePath,
} from '@/i18n/locale-policy.mjs';
import { languageNavigationSuffix } from '@/lib/languageNavigation';

export const LANGUAGE_PREFERENCE_KEY = 'fabsy.language.v1';

export default function LanguageSelector() {
  const id = useId();
  const { t } = useTranslation();
  const { locale, basePath, availableLocales, intakeHandoff } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Languages className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>{t('language.selector')}</label>
      <select id={id} aria-label={t('language.selector')} value={locale} disabled={loading}
        className="min-h-10 max-w-[9rem] rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onChange={async event => {
          const next = event.target.value as LocaleCode;
          setLoading(true);
          try {
            // Load before changing the URL so an active intake isn't unmounted
            // while the next dictionary arrives.
            await loadLocale(next);
            try { localStorage.setItem(LANGUAGE_PREFERENCE_KEY, next); } catch { /* Private browsing must not break navigation. */ }
            const editorialHandoff = editorialLanguageHandoffDestination(next, basePath, location.pathname, location.state);
            if (editorialHandoff) {
              // Editorial copy remains English-only. Move to the translated
              // overview, or restore it, without inventing a localized article URL.
              navigate(editorialHandoff.path, { state: editorialHandoff.state });
            } else {
              const target = next === 'en' || registry.phase1Routes.includes(basePath) ? basePath : '/';
              navigate(localizePath(target + languageNavigationSuffix(location.search, location.hash), next), { state: intakeHandoff || location.state });
            }
          } catch { /* Stay on the working language when a bundle cannot load. */ }
          finally { setLoading(false); }
        }}>
        {availableLocales.map(item => <option key={item.code} value={item.code} lang={item.languageTag} dir={item.dir as 'ltr' | 'rtl'}>{item.nativeName}</option>)}
      </select>
    </div>
  );
}
