import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useLocale } from '@/i18n/locale-context';
import { getLocaleInstance, loadLocale, locales, registry, review, type LocaleCode } from '@/i18n/config';
import { localizePath, preferredLocale } from '@/i18n/locale-policy.mjs';
import { LANGUAGE_PREFERENCE_KEY } from './LanguageSelector';

export default function LanguageMessages() {
  const { t } = useTranslation();
  const { locale, basePath, isReleased, availableLocales, intakeHandoff } = useLocale();
  const location = useLocation();
  const [suggestion, setSuggestion] = useState<LocaleCode | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isEnglish = locale === 'en';
  const availableCodes = availableLocales.map(item => item.code).join(',');

  useEffect(() => {
    let cancelled = false;
    setSuggestion(null);
    if (!isEnglish || !registry.phase1Routes.includes(basePath)) return;
    try {
      if (localStorage.getItem(LANGUAGE_PREFERENCE_KEY)) return;
      if (sessionStorage.getItem('fabsy.language-offer-dismissed.v1')) return;
    } catch { /* The banner also works when browser storage is disabled. */ }
    const controller = new AbortController();
    const headerTimeout = window.setTimeout(() => controller.abort(), 1500);
    const available = availableCodes.split(',');
    const browserChoice = preferredLocale(navigator.languages, available);
    // Cloudflare can supply the actual header. Static/Vite hosts fall back to
    // navigator.languages; neither path ever performs a redirect.
    void (async () => {
      let offered = browserChoice;
      try {
        const response = await fetch('/api/language', { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
          const data = await response.json() as { locale?: unknown };
          if (typeof data.locale === 'string' && available.includes(data.locale)) offered = data.locale as LocaleCode;
        }
      } catch { /* Header endpoint is optional; browser preference is adequate. */ }
      finally { window.clearTimeout(headerTimeout); }
      if (!offered || offered === 'en' || cancelled) return;
      try { await loadLocale(offered); if (!cancelled) setSuggestion(offered); } catch { /* Stay in English. */ }
    })();
    return () => { cancelled = true; window.clearTimeout(headerTimeout); controller.abort(); };
  }, [isEnglish, basePath, availableCodes]);

  const englishUrl = localizePath(basePath + location.search + location.hash, 'en');
  if (!isEnglish && !isReleased) {
    return <aside className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950" data-translation-status="draft">
      <div className="container mx-auto max-w-6xl">
        <strong>{t('language.draftTitle')}</strong>{' '}{t('language.draftBody')}{' '}
        <Link className="font-semibold underline underline-offset-2" to={englishUrl} state={intakeHandoff || location.state}>{t('language.readEnglish')}</Link>
      </div>
    </aside>;
  }
  if (!isEnglish && isReleased && review.locales[locale]?.status === 'published') {
    return <aside role="note" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs leading-relaxed text-slate-600" data-translation-status="machine-translated">
      <div className="container mx-auto max-w-6xl">
        <strong className="font-medium text-slate-700">{t('language.translationNoteTitle')}</strong>
        <p>{t('language.translationNoteBody')}</p>
      </div>
    </aside>;
  }
  if (!suggestion || dismissed) return null;
  const candidate = locales.find(item => item.code === suggestion)!;
  const translated = getLocaleInstance(suggestion)!;
  return <aside className="border-b border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-slate-900">
    <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
      <p lang={candidate.languageTag} dir={candidate.dir as 'ltr' | 'rtl'}>{translated.t('language.offer', { language: candidate.nativeName })}{' '}
        <Link className="font-semibold text-primary underline" to={localizePath(basePath + location.search + location.hash, suggestion)} state={intakeHandoff || location.state}
          onClick={() => { try { localStorage.setItem(LANGUAGE_PREFERENCE_KEY, suggestion); } catch { /* optional */ } }}>
          {translated.t('language.switch', { language: candidate.nativeName })}
        </Link>
      </p>
      <button type="button" aria-label={t('language.dismiss')} className="rounded p-2 focus-visible:outline focus-visible:outline-primary" onClick={() => {
        setDismissed(true);
        try { sessionStorage.setItem('fabsy.language-offer-dismissed.v1', '1'); } catch { /* optional */ }
      }}><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  </aside>;
}
