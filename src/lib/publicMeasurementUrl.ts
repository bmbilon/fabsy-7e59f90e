import { publicGoogleMeasurementUrl } from './googleMeasurement';
import { publicMetaMeasurementUrl } from './metaMeasurement';
import type { MeasurementProvider } from './measurementNavigation';

/**
 * Document isolation uses the union of reviewed provider URLs. Each provider
 * still applies its own narrower URL, consent and production checks.
 */
export function publicMeasurementDocumentUrl(url: URL): boolean {
  return publicGoogleMeasurementUrl(url) || publicMetaMeasurementUrl(url);
}

/** The provider-specific half of the document boundary's public URL policy. */
export function publicProviderMeasurementUrl(provider: MeasurementProvider, url: URL): boolean {
  return provider === 'google' ? publicGoogleMeasurementUrl(url) : publicMetaMeasurementUrl(url);
}
