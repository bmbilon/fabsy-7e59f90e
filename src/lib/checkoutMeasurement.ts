export type CheckoutMeasurementConsentChoice = 'unknown' | 'accepted' | 'declined';

export interface CheckoutMeasurementScopes {
  meta: boolean;
  funnel: boolean;
}

export interface CheckoutMeasurementEnvelope {
  handle: string;
  scopes: CheckoutMeasurementScopes;
}

const checkoutHandlePattern = /^[0-9a-f]{64}$/;

/**
 * Reads the server-owned measurement handoff without guessing which consent
 * produced it. The legacy field remains accepted as Meta-only so an older
 * deployed Edge function can be paired safely with a newer browser bundle.
 */
export function checkoutMeasurementEnvelope(value: unknown): CheckoutMeasurementEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  const currentHandle = response.measurementAttributionHandle;
  const currentScopes = response.measurementAttributionScopes;
  if (typeof currentHandle === 'string' && checkoutHandlePattern.test(currentHandle)) {
    if (!currentScopes || typeof currentScopes !== 'object' || Array.isArray(currentScopes)) return null;
    const scopes = currentScopes as Record<string, unknown>;
    if (typeof scopes.meta !== 'boolean' || typeof scopes.funnel !== 'boolean' ||
        (!scopes.meta && !scopes.funnel)) return null;
    return { handle: currentHandle, scopes: { meta: scopes.meta, funnel: scopes.funnel } };
  }

  const legacyHandle = response.metaAttributionHandle;
  return typeof legacyHandle === 'string' && checkoutHandlePattern.test(legacyHandle)
    ? { handle: legacyHandle, scopes: { meta: true, funnel: false } }
    : null;
}

/** Recheck both server-recorded scopes after the checkout request finishes. */
export function checkoutMeasurementWithdrawalRequired(
  scopes: CheckoutMeasurementScopes,
  choices: { meta: CheckoutMeasurementConsentChoice; funnel: CheckoutMeasurementConsentChoice },
): boolean {
  return (scopes.meta && choices.meta !== 'accepted') ||
    (scopes.funnel && choices.funnel !== 'accepted');
}
