import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FABSY_FUNNEL_CONSENT_CHANGED,
  getFabsyFunnelConsentChoice,
} from '@/lib/fabsyFunnelConsent';
import { recordFunnelEvent } from '@/lib/funnelMeasurement';

const intakeEvents = new Map<string, Parameters<typeof recordFunnelEvent>[0]>([
  ['fabsy:intake-form-start', 'intake_started'],
  ['fabsy:intake-ticket-upload-started', 'ticket_upload_started'],
  ['fabsy:intake-ticket-upload-failed', 'ticket_upload_failed'],
  ['fabsy:intake-ticket-uploaded', 'ticket_uploaded'],
  ['fabsy:intake-lead-saved', 'lead_saved'],
  ['fabsy:intake-checkout-started', 'checkout_started'],
]);

const engagementCheckpoints = [10, 30, 60] as const;
const scrollCheckpoints = [25, 50, 75, 90] as const;

function isRapidResolution(pathname: string): boolean {
  return pathname.replace(/\/$/, '').endsWith('/rapid-resolution');
}

export default function FunnelMeasurement() {
  const location = useLocation();

  useEffect(() => {
    const recordPage = () => {
      if (isRapidResolution(location.pathname)) {
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
    if (!isRapidResolution(location.pathname)) return;

    let visibleElapsedMs = 0;
    let previousTick = performance.now();
    const visibleCtas = new Map<Element, string>();

    const recordVisibleCtas = () => {
      if (getFabsyFunnelConsentChoice() !== 'accepted') return;
      for (const position of visibleCtas.values()) {
        void recordFunnelEvent('primary_cta_viewed', {
          position: position as 'hero' | 'header' | 'sticky' | 'section' | 'footer',
          dedupeKey: `primary_cta_viewed:${position}`,
        });
      }
    };

    const recordScroll = () => {
      if (getFabsyFunnelConsentChoice() !== 'accepted') return;
      const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const reached = documentHeight > 0
        ? ((window.scrollY + window.innerHeight) / documentHeight) * 100
        : 0;
      for (const checkpoint of scrollCheckpoints) {
        if (reached >= checkpoint) void recordFunnelEvent(`scroll_${checkpoint}` as const, {
          dedupeKey: `scroll_${checkpoint}`,
        });
      }
    };

    const tick = () => {
      const now = performance.now();
      const delta = Math.min(Math.max(now - previousTick, 0), 1500);
      previousTick = now;
      if (document.visibilityState !== 'visible' || getFabsyFunnelConsentChoice() !== 'accepted') return;
      visibleElapsedMs += delta;
      for (const checkpoint of engagementCheckpoints) {
        if (visibleElapsedMs >= checkpoint * 1000) void recordFunnelEvent(`engaged_${checkpoint}s` as const, {
          dedupeKey: `engaged_${checkpoint}s`,
        });
      }
    };

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const position = (entry.target as HTMLElement).dataset.funnelPosition || 'section';
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) visibleCtas.set(entry.target, position);
        else visibleCtas.delete(entry.target);
      }
      recordVisibleCtas();
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-funnel-action="primary_cta"]').forEach(element => observer.observe(element));

    let scrollFrame: number | null = null;
    const onScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        recordScroll();
      });
    };
    const onConsent = () => {
      previousTick = performance.now();
      if (getFabsyFunnelConsentChoice() === 'accepted') {
        recordVisibleCtas();
        recordScroll();
      }
    };
    const onVisibility = () => { previousTick = performance.now(); };
    const interval = window.setInterval(tick, 1000);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onConsent);
    document.addEventListener('visibilitychange', onVisibility);
    recordScroll();

    return () => {
      window.clearInterval(interval);
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener(FABSY_FUNNEL_CONSENT_CHANGED, onConsent);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [location.pathname]);

  useEffect(() => {
    const onAction = (event: Event) => {
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
    // Pointer activation is captured before a link can navigate away. Click is
    // retained for keyboard activation; the shared dedupe key prevents double
    // counting when a pointer produces both events.
    document.addEventListener('pointerdown', onAction, true);
    document.addEventListener('click', onAction, true);
    return () => {
      document.removeEventListener('pointerdown', onAction, true);
      document.removeEventListener('click', onAction, true);
    };
  }, []);

  useEffect(() => {
    const listeners: Array<[string, EventListener]> = [];
    for (const [sourceName, eventName] of intakeEvents) {
      const listener = () => { void recordFunnelEvent(eventName, { dedupeKey: eventName }); };
      window.addEventListener(sourceName, listener);
      listeners.push([sourceName, listener]);
    }
    const stepListener = (eventName: 'intake_step_viewed' | 'intake_validation_blocked' | 'intake_step_completed') => (event: Event) => {
      const step = event instanceof CustomEvent && typeof event.detail?.step === 'number'
        ? event.detail.step
        : undefined;
      if (step !== undefined) void recordFunnelEvent(eventName, {
        step,
        dedupeKey: `${eventName}:${step}`,
      });
    };
    const stepViewedListener = stepListener('intake_step_viewed');
    const validationBlockedListener = stepListener('intake_validation_blocked');
    const stepCompletedListener = stepListener('intake_step_completed');
    window.addEventListener('fabsy:intake-step-viewed', stepViewedListener);
    window.addEventListener('fabsy:intake-validation-blocked', validationBlockedListener);
    window.addEventListener('fabsy:intake-step-completed', stepCompletedListener);
    return () => {
      for (const [sourceName, listener] of listeners) window.removeEventListener(sourceName, listener);
      window.removeEventListener('fabsy:intake-step-viewed', stepViewedListener);
      window.removeEventListener('fabsy:intake-validation-blocked', validationBlockedListener);
      window.removeEventListener('fabsy:intake-step-completed', stepCompletedListener);
    };
  }, []);

  return null;
}
