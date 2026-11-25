import { useEffect, useState } from 'react';

/** Live media query, read synchronously on first render to avoid a layout jump. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} | AnderHue Paralegal` : 'AnderHue Paralegal';
  }, [title]);
}

/** Seconds left until `until` (ms timestamp), ticking once a second. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

/** Warns before leaving the page while something important is in flight. */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
