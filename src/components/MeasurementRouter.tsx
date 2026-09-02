import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Router, type BrowserRouterProps } from 'react-router-dom';
import { publicMeasurementDocumentUrl, publicProviderMeasurementUrl } from '@/lib/publicMeasurementUrl';
import {
  createMeasurementHistory, type ProviderMeasurementUrl, type PublicMeasurementUrl,
} from '@/lib/measurementNavigation';
import GoogleMeasurementGuardian from './GoogleMeasurementGuardian';

interface MeasurementRouterProps extends Pick<BrowserRouterProps, 'basename' | 'future' | 'window'> {
  children: ReactNode;
  isPublicUrl?: PublicMeasurementUrl;
  isProviderPublicUrl?: ProviderMeasurementUrl;
  /** Used only by offline tests, so no actual document requests occur. */
  navigateDocument?: (url: URL, method: 'assign' | 'replace') => void;
}

/** Route private pages only inside a fresh, permanently untagged document. */
export default function MeasurementRouter({
  children, basename, future, window: suppliedWindow,
  isPublicUrl = publicMeasurementDocumentUrl, isProviderPublicUrl, navigateDocument,
}: MeasurementRouterProps) {
  const historyRef = useRef<ReturnType<typeof createMeasurementHistory>>();
  if (!historyRef.current) {
    historyRef.current = createMeasurementHistory({
      window: suppliedWindow || window,
      isPublicUrl,
      isProviderPublicUrl: isProviderPublicUrl ||
        (isPublicUrl === publicMeasurementDocumentUrl ? publicProviderMeasurementUrl : undefined),
      navigateDocument,
    });
  }
  const history = historyRef.current;
  const [state, setState] = useState(history.getSnapshot);
  useLayoutEffect(() => history.listen(setState), [history]);

  // The target is never delivered to <Router> or a private route component in
  // the old document, even while a full document navigation is still pending.
  return <>
    {/* Consent must still retire the old tag if the document request stalls. */}
    <GoogleMeasurementGuardian />
    {state.blocked
      ? <main className="min-h-screen" aria-busy="true"><p role="status" className="sr-only">Opening a secure page…</p></main>
      : <Router basename={basename} future={future} location={state.location}
        navigationType={state.action} navigator={history.navigator}>{children}</Router>}
  </>;
}
