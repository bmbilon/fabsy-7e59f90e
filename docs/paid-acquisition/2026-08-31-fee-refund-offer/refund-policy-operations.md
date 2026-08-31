# Fee-refund offer and operating checklist

Updated August 31, 2026 following Brett's clarification: the clock starts after the Crown rejects Fabsy's negotiation efforts for a lower fine, fewer demerits or withdrawal, with none of those improvements obtained. Payment does not start the clock. Publication evidence is recorded separately; this document does not claim a deployment, paid conversion, campaign launch or completed refund.

## Public promise

**Fine or demerits reduced—or your fee refunded.**

The service fee is paid upfront. Payment does not start the 30-day refund clock. No legal outcome is guaranteed. If the Crown rejects Fabsy's efforts to reduce the original fine or demerits, or obtain a withdrawal, and none of those improvements is obtained, Fabsy refunds the service fee paid within 30 calendar days of Fabsy receiving the rejection. For registered-owner photo radar and red-light camera notices, the negotiation concerns the original fine or withdrawal only: those notices have no demerits.

The complete public terms are at [Terms of Service, section 5F](https://fabsy.ca/terms-of-service#fee-refund-guarantee). The implementation uses `src/config/feeRefund.json` for the reusable notice and corresponding translated keys for the seven existing language interfaces. English purchase terms remain controlling; publication does not assert native review or a staffed service in every language.

## Scope

- Refund the actual service fee paid for Rapid Resolution, Photo Radar or the Rapid Resolution plus insurance-planning bundle, including discounted Pro Driver orders, plus the corresponding GST. The promise covers the bundle's full paid service fee, not an invented allocation to one component.
- A standalone insurance report is not ticket representation and is outside this outcome-based promise. Government fines, court charges and third-party costs are separate.
- Any reduction in the original fine or demerits is an improvement. Withdrawal or dismissal is also an improvement. No minimum reduction, final-offer-only rule, guilty-plea requirement or customer claim deadline has been added.
- The 30-day clock starts when Fabsy receives the Crown's rejection of Fabsy's negotiation efforts, with no reduction in the original fine or demerits and no withdrawal obtained. Payment, checkout, and an opening or unchanged Crown offer before rejection of those efforts do not start it. This is not a 30-day case-resolution promise. Once a qualifying rejection is received, do not defer or restart the clock while seeking another offer or awaiting the client's acceptance.
- Work already performed and payment-processing costs cannot reduce a refund due under the guarantee. Subtract only amounts already refunded, to prevent duplicate repayment.
- Ordinary cancellation provisions remain separate and cannot defeat the advertised guarantee or statutory rights. Existing orders keep their applicable written purchase terms; do not edit historical signed PDFs to impose new terms.

## Operating checklist for an authorized refund operator

1. Preserve the original fine and demerit position from the accepted ticket, the applicable written purchase terms, and the actual paid order. Keep those records in the existing private case/payment systems, not analytics or ad platforms.
2. Record Fabsy's negotiation requests for a lower fine, fewer demerits or withdrawal, the Crown's response, and when Fabsy received it. Compare any agreed reduction with the original penalty; for owner-camera notices, compare the original fine or withdrawal only. Preserve the rejection evidence in the existing private case system.
3. When the Crown rejects those efforts and no reduction or withdrawal has been obtained, record a refund due date 30 calendar days after Fabsy received that rejection and assign responsibility for completing it. Never calculate this deadline from payment or an opening offer. Customer acceptance or a guilty plea is not a prerequisite; do not add a final-offer or appeal-exhaustion requirement.
4. Retrieve the paid Stripe order and prior-refund history through the existing authorized payment workflow. Verify the actual fee, discount, GST and remaining refundable amount. Do not infer a refund from a marketing list price or browser return event.
5. An authorized operator must execute and verify the refund through the existing payment process. This copy release does not create a refund API, authorize this agent to refund any individual order, or perform a refund.
6. Retain the payment processor's refund result, amount and timestamp in the private case record. Handle failures promptly enough to meet the promise; do not describe an unverified attempt as a completed refund.

No automated Crown-rejection monitor or refund worker is introduced by this release. The business must operate the above process so the promise can be honoured.

## Advertising and legal-outcome distinction

Brett requested “We get your ticket reduced or thrown out or you don't pay” and “Success guaranteed or your money back.” A later Meta review also preserves his requested “Guaranteed win or your money back*” alternative. The qualified release copy makes the service-fee refund prominent, explicitly says payment is upfront, and does not imply control over a court or Crown decision. “No hidden fees” replaces “No success fee” in the prepared ad benefits; written pricing and government charges remain visible.

Google responsive-search-ad headlines use **Ticket Reduced Or Fee Refunded** or **Fine Reduced Or Fee Refunded**, with the refund condition pinned in the first description and the existing price pins preserved. Responsive assets may be combined or truncated by the platform; the full terms must also be visible on the landing page. No wording is represented as pre-approved by Google or a regulator.

Court/Crown communications are handled for the client within the accepted representation scope. Do not advertise unconditional exemption from legally required attendance or deadline duties. Use “Court and Crown communications, handled for you. Start online—no office appointment.”

## Sources checked for the copy review

- [Google Ads misrepresentation policy](https://support.google.com/adspolicy/answer/6020955?hl=en): advertising and destinations must accurately disclose material offer terms.
- [Google Ads unreliable claims policy](https://support.google.com/adspolicy/answer/15936857?hl=en): avoid inaccurate or improbable outcome expectations. Its health-specific refund example is not general approval for legal-service outcome claims.
- [Competition Bureau: warranties and guarantees](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/types-deceptive-marketing-practices/warranties-and-guarantees): a guarantee must not mislead and must have a reasonable prospect of being honoured.
- [Competition Bureau: general impression test](https://competition-bureau.canada.ca/en/deceptive-marketing-practices/general-impression-test): review the overall impression as well as literal wording.

## Release boundaries

Preserve all Google consent, private-navigation, SHA256 transaction-ID, locale, pricing, payment and conversion-routing guards from activation source `3a187b2d` and the fee-refund release. This timing correction changes no backend function: the existing future consent template already defers to each order's written purchase terms. Do not regenerate stored customer documents. All campaigns remain off, both Google purchase actions remain Secondary, and no budget, audience, enhanced-conversion setting, payment or customer message is changed by this copy correction.
