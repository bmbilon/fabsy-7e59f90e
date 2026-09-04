import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FABSY_FUNNEL_CONSENT_CHANGED,
  getFabsyFunnelConsentChoice,
} from '@/lib/fabsyFunnelConsent';
import { recordFunnelEvent } from '@/lib/funnelMeasurement';

const intakeEvents = new Map<string, Parameters<typeof recordFunnelEvent>[0]>([
  ['fabsy:intake-form-start', 'intake_started'],
  ['fabsy:intake-ticket-uploaded', 'ticket_uploaded'],
  ['fabsy:intake-lead-saved', 'lead_saved'],
  ['fabsy:intake-checkout-started', 'checkout_started'],
]);

export default function FunnelMeasurement() {
  const location = useLocation();

  useEffect(() => {
    const recordPage = () => {
      if (location.pathname.replace(/\/$/, '').endsWith('/rapid-resolution')) {
        void recordFunnelEvent('landing_view', { dedupeKey: 'landing_view' });
      } else if (location.pathname.replace(/\/$/, '').endsWith('/payment-canceled')) {
        void recordFunnelEvent('checkout_canceled', { dedupeKey: 'checkout_canceled' });
      }
    };
    recordPage();
    const onConsent = () => {
      if (getFabsyFunnelConsentChoice() === 'accepted') recordPage();
    };
    window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onConsent);
    return () => window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onConsent);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-funnel-action]')
        : null;
      const action = target?.dataset.funnelAction;
      const position = target?.dataset.funnelPosition as 'hero' | 'header' | 'sticky' | 'section' | 'footer' | undefined;
      if (action === 'primary_cta') void recordFunnelEvent('primary_cta_click', {
        position,
        dedupeKey: `primary_cta_click:${position || 'unknown'}`,
      });
      if (action === 'phone') void recordFunnelEvent('phone_click', {
        position,
        dedupeKey: `phone_click:${position || 'unknown'}`,
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    const listeners: Array<[string, EventListener]> = [];
    for (const [sourceName, eventName] of intakeEvents) {
      const listener = () => { void recordFunnelEvent(eventName, { dedupeKey: eventName }); };
      window.addEventListener(sourceName, listener);
      listeners.push([sourceName, listener]);
    }
    const stepListener: EventListener = event => {
      const step = event instanceof CustomEvent && typeof event.detail?.step === 'number'
        ? event.detail.step
        : undefined;
      if (step !== undefined) void recordFunnelEvent('intake_step_completed', {
        step,
        dedupeKey: `intake_step_completed:${step}`,
      });
    };
    window.addEventListener('fabsy:intake-step-completed', stepListener);
    return () => {
      for (const [sourceName, listener] of listeners) window.removeEventListener(sourceName, listener);
      window.removeEventListener('fabsy:intake-step-completed', stepListener);
    };
  }, []);

  return null;
}
