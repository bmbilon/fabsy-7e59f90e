import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { googleConsentCopy } from '@/i18n/googleConsentCopy';
import { splitLocalePath } from '@/i18n/locale-policy.mjs';
import registry from '@/i18n/locales.json';
import * as consent from '@/lib/googleConsent';
import type { GoogleConsentChoice } from '@/lib/googleConsent';
import { publicMeasurementPath } from '@/lib/googleMeasurement';
import {
  FABSY_FUNNEL_CONSENT_CHANGED,
  FABSY_FUNNEL_CONSENT_STORAGE_KEY,
  getFabsyFunnelConsentChoice,
  setFabsyFunnelConsentChoice,
} from '@/lib/fabsyFunnelConsent';

function subscribeToConsent(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === consent.GOOGLE_CONSENT_STORAGE_KEY ||
        event.key === consent.META_CONSENT_STORAGE_KEY ||
        event.key === FABSY_FUNNEL_CONSENT_STORAGE_KEY || event.key === null) notify();
  };
  window.addEventListener(consent.GOOGLE_CONSENT_CHANGED, notify);
  if (consent.META_CONSENT_CHANGED) window.addEventListener(consent.META_CONSENT_CHANGED, notify);
  window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(consent.GOOGLE_CONSENT_CHANGED, notify);
    if (consent.META_CONSENT_CHANGED) window.removeEventListener(consent.META_CONSENT_CHANGED, notify);
    window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, notify);
    window.removeEventListener('storage', onStorage);
  };
}

const serverChoice = (): GoogleConsentChoice => 'unknown';
const getMetaChoice = (): GoogleConsentChoice => consent.getMetaConsentChoice?.() ?? consent.getGoogleConsentChoice();

/** Choice UI only. Loading, storage, expiration and withdrawal live in the consent/measurement modules. */
export default function GoogleConsent() {
  const location = useLocation();
  const { locale, path: basePath } = splitLocalePath(location.pathname);
  const localeInfo = registry.locales.find(item => item.code === locale)!;
  const copy = googleConsentCopy[locale];
  const googleChoice = useSyncExternalStore(subscribeToConsent, consent.getGoogleConsentChoice, serverChoice);
  // In legacy/offline adapters without a Meta state, mirror Google only for
  // compatibility. Production always has the separate Meta v1 record.
  const metaChoice = useSyncExternalStore(subscribeToConsent, getMetaChoice, serverChoice);
  const fabsyChoice = useSyncExternalStore(subscribeToConsent, getFabsyFunnelConsentChoice, serverChoice);
  const [settingsLocation, setSettingsLocation] = useState<string | null>(null);
  const [dismissedInitial, setDismissedInitial] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const panelId = `${id}-google-consent`;
  const headingId = `${id}-heading`;
  const descriptionId = `${id}-description`;
  const statusId = `${id}-status`;
  const sensitive = /(?:^|\/)representation-consent(?:\/|$)/.test(basePath);
  // A manually opened panel does not follow navigation into a form or portal.
  const settingsOpen = settingsLocation === location.key;
  const initialBanner = (googleChoice === 'unknown' || metaChoice === 'unknown' || fabsyChoice === 'unknown') &&
    !dismissedInitial && Boolean(publicMeasurementPath(location.pathname));
  const panelOpen = settingsOpen || initialBanner;
  const compactInitialBanner = initialBanner && !settingsOpen;
  const allChoices = [googleChoice, metaChoice, fabsyChoice];
  const status = allChoices.every(choice => choice === 'accepted')
    ? copy.acceptedStatus
    : allChoices.every(choice => choice === 'declined')
      ? copy.declinedStatus
      : allChoices.every(choice => choice === 'unknown')
        ? copy.unknownStatus
        : copy.mixedStatus;

  useEffect(() => {
    // The automatic banner never steals focus from page content. Opening
    // settings deliberately moves focus to its nonmodal, labelled region.
    if (settingsOpen && !sensitive) heading.current?.focus({ preventScroll: true });
  }, [settingsOpen, sensitive]);

  useEffect(() => {
    const attribute = 'data-initial-measurement-consent-open';
    if (compactInitialBanner) document.documentElement.setAttribute(attribute, 'true');
    else document.documentElement.removeAttribute(attribute);
    return () => document.documentElement.removeAttribute(attribute);
  }, [compactInitialBanner]);

  const closeSettings = () => {
    setSettingsLocation(null);
    // Dismissal never becomes acceptance or refusal. Measurement stays off
    // when there is no stored choice; settings remain available below.
    setDismissedInitial(true);
    if (settingsOpen) settingsButton.current?.focus({ preventScroll: true });
  };

  const choose = (next: 'accepted' | 'declined') => {
    setFabsyFunnelConsentChoice(next);
    consent.setGoogleConsentChoice(next);
    consent.setMetaConsentChoice?.(next);
    closeSettings();
  };

  if (sensitive) return null;

  return <div lang={localeInfo.languageTag} dir={localeInfo.dir as 'ltr' | 'rtl'}
    data-google-consent-controls data-measurement-consent-controls>
    {/* In normal document flow: this control cannot cover the mobile purchase bar. */}
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-slate-50 px-4 py-3 text-center">
      <Button ref={settingsButton} type="button" variant="link" className="h-auto min-h-11 whitespace-normal px-2 py-2 text-slate-700"
        aria-expanded={panelOpen} aria-controls={panelOpen ? panelId : undefined} aria-describedby={statusId}
        onClick={() => setSettingsLocation(location.key)}>
        {copy.settings}
      </Button>
      <span id={statusId} role="status" aria-live="polite" className="text-xs leading-relaxed text-slate-600">{status}</span>
    </div>
    {panelOpen && <section id={panelId} role="region" aria-labelledby={headingId} aria-describedby={descriptionId}
      data-google-consent-panel
      data-google-consent-panel-mode={compactInitialBanner ? 'initial' : 'settings'}
      className={compactInitialBanner
        ? 'fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[60] max-h-[6.5rem] overflow-hidden rounded-lg border border-slate-300 bg-white p-2.5 text-start text-slate-900 shadow-xl md:inset-x-auto md:bottom-4 md:end-4 md:w-[32rem] md:max-h-[25vh] md:max-w-[calc(100vw-2rem)] md:p-3'
        : 'fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] max-h-[60vh] overflow-y-auto rounded-xl border border-slate-300 bg-white p-4 text-start text-slate-900 shadow-xl md:inset-x-auto md:bottom-4 md:end-4 md:w-[30rem] md:max-w-[calc(100vw-2rem)] md:p-5'}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSettings();
        }
      }}>
      {compactInitialBanner ? <div className="grid max-h-[calc(6.5rem-1.25rem)] grid-rows-[minmax(0,1fr)_auto] gap-2 md:max-h-[calc(25vh-1.5rem)]">
        <h2 id={headingId} ref={heading} tabIndex={-1} className="sr-only outline-none">{copy.title}</h2>
        <p id={descriptionId} tabIndex={0} className="min-h-0 overflow-y-auto text-xs leading-4 text-slate-700" aria-label={`${copy.title}. ${copy.body}`}>
          {copy.body}{' '}
          <Link to="/privacy-policy" className="font-medium text-slate-800 underline underline-offset-2" onClick={closeSettings}>{copy.privacyPolicy}</Link>
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-stretch gap-1.5">
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-slate-400 px-2 py-1.5 text-center text-xs leading-4 text-slate-900" data-google-consent-choice="accepted" onClick={() => choose('accepted')}>
            {copy.allow}
          </Button>
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-slate-400 px-2 py-1.5 text-center text-xs leading-4 text-slate-900" data-google-consent-choice="declined" onClick={() => choose('declined')}>
            {copy.decline}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" aria-label={copy.close} onClick={closeSettings}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div> : <>
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} ref={heading} tabIndex={-1} className="text-base font-semibold leading-relaxed outline-none">{copy.title}</h2>
          <Button type="button" variant="ghost" size="icon" className="-mt-2 -me-2 min-h-11 min-w-11 shrink-0" aria-label={copy.close} onClick={closeSettings}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-slate-700">{copy.body}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{copy.scope}</p>
        <div className="mt-4 grid grid-cols-2 items-stretch gap-3">
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-slate-400 px-3 py-3 text-center text-sm text-slate-900" data-google-consent-choice="accepted" onClick={() => choose('accepted')}>
            {copy.allow}
          </Button>
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-slate-400 px-3 py-3 text-center text-sm text-slate-900" data-google-consent-choice="declined" onClick={() => choose('declined')}>
            {googleChoice === 'accepted' || metaChoice === 'accepted' || fabsyChoice === 'accepted' ? copy.withdraw : copy.decline}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">{copy.changeHint}{' '}
          <Link to="/privacy-policy" className="inline-block py-1 font-medium text-slate-800 underline underline-offset-2" onClick={closeSettings}>{copy.privacyPolicy}</Link>
        </p>
      </>}
    </section>}
  </div>;
}
