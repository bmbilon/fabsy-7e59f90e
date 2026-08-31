import {
  Action, createBrowserHistory, createMemoryHistory, parsePath,
  type History, type Location, type To,
} from '@remix-run/router';
import { clearTemporaryGoogleConsent, getGoogleConsentChoice, GOOGLE_CONSENT_CHANGED } from './googleConsent';

export type PublicMeasurementUrl = (url: URL) => boolean;
type DocumentKind = 'public' | 'private' | 'receipt';
type DocumentNavigation = 'assign' | 'replace';

// A fixed, data-free marker forces a real document request when only the
// fragment changes. Location.assign('/current#…') alone is a same-document move.
const DOCUMENT_MARKER = '__fabsy_document';
const receiptPath = /^\/(?:en\/|pa\/|tl\/|zh-hans\/|zh-hant\/|ar\/|hi\/|es\/)?thank-you\/?$/;
const receiptSession = /^cs_(?:test_|live_)[A-Za-z0-9]+$/;

interface DocumentBoundary {
  kind: DocumentKind;
  origin: string;
  isPublicUrl: PublicMeasurementUrl;
  receiptHref?: string;
  receiptSessionId?: string;
  receiptScrubbed: boolean;
  tagRequested: boolean;
  leaving: boolean;
  replaceState: Window['history']['replaceState'];
}

const documents = new WeakMap<Window, DocumentBoundary>();

function browserWindow(candidate?: Window): Window | undefined {
  return candidate || (typeof window === 'undefined' ? undefined : window);
}

function hasGoogleTag(win: Window, boundary?: DocumentBoundary): boolean {
  return Boolean(boundary?.tagRequested || win.fabsyAnalyticsInitialized ||
    win.document?.getElementById?.('fabsy-google-tag'));
}

function isPublic(url: URL, boundary: Pick<DocumentBoundary, 'origin' | 'isPublicUrl'>): boolean {
  try {
    return url.origin === boundary.origin && /^https?:$/.test(url.protocol) &&
      !url.username && !url.password && boundary.isPublicUrl(url);
  } catch {
    return false;
  }
}

function initialReceipt(url: URL, boundary: Pick<DocumentBoundary, 'origin' | 'isPublicUrl'>): string | null {
  const entries = Array.from(url.searchParams);
  if (!receiptPath.test(url.pathname) || url.hash || entries.length !== 1 ||
      entries[0][0] !== 'session_id' || !receiptSession.test(entries[0][1])) return null;
  const clean = new URL(url.href);
  clean.search = '';
  return isPublic(clean, boundary) ? entries[0][1] : null;
}

/** Register before rendering route children or attempting to initialize a tag. */
export function registerMeasurementDocument(win: Window, isPublicUrl: PublicMeasurementUrl): void {
  if (documents.has(win)) return;
  const replaceState = win.history.replaceState.bind(win.history);
  let url = new URL(win.location.href);
  // This runs in the new, untagged document, before the Router reads its URL.
  // Unknown marker values or duplicates are not a licence to scrub other data.
  if (!hasGoogleTag(win) && url.searchParams.getAll(DOCUMENT_MARKER).length === 1 &&
      url.searchParams.get(DOCUMENT_MARKER) === '1') {
    const clean = new URL(url.href);
    clean.searchParams.delete(DOCUMENT_MARKER);
    try {
      replaceState(win.history.state, '', clean.pathname + clean.search + clean.hash);
      url = new URL(win.location.href);
    } catch {
      // The marker stays an unknown query field, so the document stays private.
    }
  }
  const policy = { origin: url.origin, isPublicUrl };
  const sessionId = initialReceipt(url, policy);
  documents.set(win, {
    ...policy,
    kind: isPublic(url, policy) ? 'public' : sessionId ? 'receipt' : 'private',
    receiptHref: sessionId ? url.href : undefined,
    receiptSessionId: sessionId || undefined,
    receiptScrubbed: false,
    tagRequested: false,
    leaving: false,
    replaceState,
  });
}

/** URL eligibility alone cannot make a formerly private document taggable. */
export function googleTagMayLoadInDocument(candidate?: Window): boolean {
  const win = browserWindow(candidate);
  const boundary = win && documents.get(win);
  if (!win || !boundary || boundary.leaving || boundary.kind === 'private' ||
      (boundary.kind === 'receipt' && !boundary.receiptScrubbed)) return false;
  return isPublic(new URL(win.location.href), boundary);
}

/** Call synchronously before inserting or queueing a Google tag, not on load. */
export function markGoogleTagPending(candidate?: Window): boolean {
  const win = browserWindow(candidate);
  if (!win || !googleTagMayLoadInDocument(win)) return false;
  documents.get(win)!.tagRequested = true;
  // Never clear this marker in the same document, even after an error/removal.
  return true;
}

/**
 * One authorized receipt transition after its component retained the session.
 * Do not notify the Router: its current location keeps that session in memory,
 * without placing the bearer token in history.state or browser storage.
 */
export function scrubCheckoutReceiptUrl(expectedSessionId: string | null, candidate?: Window): boolean {
  const win = browserWindow(candidate);
  const boundary = win && documents.get(win);
  if (!win || !boundary || boundary.kind !== 'receipt' || boundary.receiptScrubbed ||
      boundary.leaving || hasGoogleTag(win, boundary) || !expectedSessionId ||
      expectedSessionId !== boundary.receiptSessionId || win.location.href !== boundary.receiptHref) return false;
  const url = new URL(win.location.href);
  if (initialReceipt(url, boundary) !== expectedSessionId) return false;
  try {
    boundary.replaceState(win.history.state, '', url.pathname);
  } catch {
    return false;
  }
  // A failed/no-op replacement must not authorize tag initialization.
  if (win.location.href !== url.origin + url.pathname) return false;
  boundary.receiptScrubbed = true;
  boundary.receiptHref = undefined;
  boundary.receiptSessionId = undefined;
  return true;
}

function needsDocument(url: URL, win: Window, boundary: DocumentBoundary): boolean {
  if (boundary.leaving || url.origin !== boundary.origin || url.username || url.password ||
      !/^https?:$/.test(url.protocol)) return true;
  // A new receipt capability always starts a new document, including a second
  // receipt on the same pathname. It cannot reuse an already tagged receipt.
  if (initialReceipt(url, boundary)) return true;
  if (isPublic(url, boundary)) {
    return boundary.kind === 'private' || (boundary.kind === 'receipt' && !boundary.receiptScrubbed);
  }
  return boundary.kind !== 'private' || hasGoogleTag(win, boundary);
}

function currentDocumentIsUnsafe(win: Window, boundary: DocumentBoundary): boolean {
  const url = new URL(win.location.href);
  if (boundary.kind === 'private') return hasGoogleTag(win, boundary) || isPublic(url, boundary);
  if (boundary.kind === 'receipt' && !boundary.receiptScrubbed) {
    return hasGoogleTag(win, boundary) || url.href !== boundary.receiptHref;
  }
  return !isPublic(url, boundary);
}

function suppressReferrer(win: Window): void {
  // Do not let a private URL become the next document's immutable referrer.
  // The independent measurement referrer gate still fails closed if a browser
  // cannot apply this policy.
  try {
    let meta = win.document.querySelector<HTMLMetaElement>('meta[data-fabsy-navigation-referrer]');
    if (!meta) {
      meta = win.document.createElement('meta');
      meta.name = 'referrer';
      meta.setAttribute('data-fabsy-navigation-referrer', '');
      win.document.head.appendChild(meta);
    }
    meta.content = 'no-referrer';
  } catch { /* Safe measurement also checks the real destination referrer. */ }
}

export interface MeasurementRouterSnapshot {
  action: Action;
  location: Location;
  blocked: boolean;
}

interface MeasurementHistoryOptions {
  window: Window;
  isPublicUrl: PublicMeasurementUrl;
  /** Test seam: production always uses Location.assign/replace. */
  navigateDocument?: (url: URL, method: DocumentNavigation) => void;
}

/** Keep React Router's installed history implementation; guard before calling it. */
export function createMeasurementHistory({ window: win, isPublicUrl, navigateDocument }: MeasurementHistoryOptions) {
  registerMeasurementDocument(win, isPublicUrl);
  const boundary = documents.get(win)!;
  const initiallyUnsafe = currentDocumentIsUnsafe(win, boundary);
  // Do not call even history's initialization replaceState in an unexpectedly
  // tagged private document. It must leave without mounting private children.
  const history = initiallyUnsafe
    ? createMemoryHistory({ initialEntries: [win.location.pathname + win.location.search + win.location.hash], v5Compat: true })
    : createBrowserHistory({ window: win, v5Compat: true });
  let snapshot: MeasurementRouterSnapshot = { action: history.action, location: history.location, blocked: initiallyUnsafe };
  let notify: ((state: MeasurementRouterSnapshot) => void) | undefined;

  function leave(target: URL, method: DocumentNavigation): void {
    if (boundary.leaving) return;
    boundary.leaving = true;
    snapshot = { ...snapshot, blocked: true };
    notify?.(snapshot);
    suppressReferrer(win);
    const current = new URL(win.location.href);
    const destination = new URL(target.href);
    if (current.origin === destination.origin && current.pathname === destination.pathname &&
        current.search === destination.search) {
      // Includes reloads from a blocked popstate. No same-document fragment
      // update is allowed to reveal a private URL to the old tag's listeners.
      destination.searchParams.append(DOCUMENT_MARKER, '1');
    }
    if (navigateDocument) navigateDocument(destination, method);
    else win.location[method](destination.href);
  }

  function navigate(to: To, state: unknown, replace: boolean): void {
    if (boundary.leaving) return;
    const location = {
      pathname: history.location.pathname, search: '', hash: '',
      ...(typeof to === 'string' ? parsePath(to) : to),
    };
    const target = history.createURL(location);
    // React Router handles ordinary external anchors itself. Programmatic
    // malformed/cross-origin destinations must not turn into script URLs.
    if (target.origin !== boundary.origin || target.username || target.password || !/^https?:$/.test(target.protocol)) {
      throw new Error('Router navigation requires a same-origin HTTP URL.');
    }
    if (needsDocument(target, win, boundary)) {
      leave(target, replace ? 'replace' : 'assign');
      return;
    }
    // Neither the target URL nor state reaches a Google-wrapped history method
    // until the document/route boundary has accepted this navigation.
    if (replace) history.replace(to, state);
    else history.push(to, state);
  }

  const navigator: History = {
    get action() { return snapshot.action; },
    get location() { return snapshot.location; },
    createHref: history.createHref,
    createURL: history.createURL,
    encodeLocation: history.encodeLocation,
    push: (to, state) => navigate(to, state, false),
    replace: (to, state) => navigate(to, state, true),
    go: delta => { if (!boundary.leaving) history.go(delta); },
    listen: history.listen,
  };

  function listen(listener: (state: MeasurementRouterSnapshot) => void): () => void {
    notify = listener;
    const captureTraversal = (event: Event) => {
      const target = new URL(win.location.href);
      if (!needsDocument(target, win, boundary)) return;
      event.stopImmediatePropagation();
      leave(target, 'replace');
    };
    const captureLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target as Element | null;
      const anchor = element?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const target = new URL(anchor.href, win.location.href);
      if (target.origin !== boundary.origin || !/^https?:$/.test(target.protocol) || !needsDocument(target, win, boundary)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      leave(target, 'assign');
    };
    const restoreDocument = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // Route children (including Analytics) may have unmounted when we left.
      // Re-read durable consent before remounting them or allowing later Google
      // pageshow listeners. A blocked store cannot preserve stale acceptance.
      boundary.leaving = false;
      if (hasGoogleTag(win, boundary)) {
        clearTemporaryGoogleConsent();
        if (getGoogleConsentChoice() !== 'accepted') {
          event.stopImmediatePropagation();
          // The Guardian's later pageshow listener is suppressed too. Notify
          // it synchronously so it disables the tag and invalidates pending
          // loaders even if the replacement document request stalls.
          win.dispatchEvent(new (win as Window & typeof globalThis).Event(GOOGLE_CONSENT_CHANGED));
          leave(new URL(win.location.href), 'replace');
          return;
        }
      }
      // Restoring never changes the document's original privacy classification.
      if (currentDocumentIsUnsafe(win, boundary)) {
        event.stopImmediatePropagation();
        leave(new URL(win.location.href), 'replace');
        return;
      }
      snapshot = { action: Action.Pop, location: history.location, blocked: false };
      notify?.(snapshot);
    };
    // Install capture listeners before history's popstate subscription and
    // before child passive effects can request a Google script.
    win.addEventListener('popstate', captureTraversal, true);
    win.addEventListener('hashchange', captureTraversal, true);
    win.addEventListener('click', captureLink, true);
    win.addEventListener('pageshow', restoreDocument, true);
    const unlisten = history.listen(update => {
      if (boundary.leaving) return;
      snapshot = { action: update.action, location: update.location, blocked: false };
      notify?.(snapshot);
    });
    if (initiallyUnsafe) leave(new URL(win.location.href), 'replace');
    return () => {
      notify = undefined;
      unlisten();
      win.removeEventListener('popstate', captureTraversal, true);
      win.removeEventListener('hashchange', captureTraversal, true);
      win.removeEventListener('click', captureLink, true);
      win.removeEventListener('pageshow', restoreDocument, true);
    };
  }

  return { navigator, listen, getSnapshot: () => snapshot };
}
