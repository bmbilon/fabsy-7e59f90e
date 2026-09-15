import { RAPID_RESOLUTION } from '@/config/offers';

/** The exact published outcome explanation describes a refund, not a new price. */
export function isReviewedOutcomeFaq(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const faq = value as Record<string, unknown>;
  return faq.q === 'Does Rapid Resolution promise a withdrawal or reduction?'
    && faq.a === RAPID_RESOLUTION.outcomeDisclaimer;
}
