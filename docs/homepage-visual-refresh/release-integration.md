# Homepage release integration — August 31, 2026

## Baseline and scope

The release was first integrated from production `d0424cd2`, then rebased onto the newer production `6a158f16`, including `2397ce4c` (Crown-rejection refund-clock clarification). It does not start from the older local feature branch at `03621fc2`. The visual changes were integrated by scope; unrelated dirty local files, generated artifacts and backend changes were not copied wholesale.

The homepage restores the comparison illustration and a lower-page driver image, adds accessible outcome tabs, and connects the requested headline to the refund policy. The numeric telephone link is unchanged; the English header also displays `825 79 FABSY`.

The page retains the current offer routes, prices, GST disclosure, product schema and homepage assessment analytics. InsuranceContextSection and ProDriverSection retain their production implementations. Their lower-page order is InsuranceContext → Pro Driver promotion → driver image/CTA, preserving the snapshot generator's required insurance/promotion adjacency. Each appears once.

## Policy source

`src/config/feeRefund.json` remains the canonical refund source through `FEE_REFUND`. The homepage presentation references its condition, payment disclosure, product scope, declined-offer clarification and Terms link. No new local refund policy export replaces it.

The local feature-workspace policy in `supabase/functions/_shared/rapid-resolution-refund-policy.ts` is obsolete relative to newer production policy and is deliberately **not** imported or included in this release. In particular, its narrower bundle/product scope and customer-written-rejection clock must not replace production's policy. The earlier production offer-receipt clock is also superseded by the later Crown-rejection clarification.

The production contract covers ticket-representation services, including Photo Radar and the full Rapid Resolution bundle. When the Crown rejects Fabsy's efforts to reduce the original fine or demerits, or withdraw the ticket, and no improvement is obtained, the refund clock starts when Fabsy receives that rejection. The actual service fee paid is refunded within 30 days, with corresponding GST and prior refunds accounted for. Payment, receipt of an interim Crown offer, and the client's rejection of an offer do not start this clock. Standalone insurance reports are outside this outcome guarantee. The separate canonical policy update adds the user's clarification that declining an improving offer does not qualify for this refund. Court outcomes are not guaranteed, the fee is paid upfront, and government fines and trial representation remain separate.

The hero's requested “We get your ticket reduced or thrown out, or you don’t pay” and “Success guaranteed or your money back” copy appears with the court-outcome qualification, Crown-rejection trigger, upfront fee and a visible policy link. The full policy and declined-offer boundary are visible below the outcome illustrations; they are not available solely through collapsed FAQs.

## Assets and implementation

- `public/fabsy-way-comparison-2026.webp`: updated comparison illustration, with case-dependent outcomes and separate trial scope explained in surrounding text and alt text.
- `src/assets/hero-driver-homepage.webp`: smiling driver imagery in the lower section, after insurance context and the Pro Driver promotion.
- Both images have explicit dimensions, useful alternative text and lazy loading.
- Outcome comparison uses semantic tables and Radix keyboard-accessible tabs. No performance counters or invented outcome statistics were added.
- `useHashScroll` handles the refund-policy anchor after homepage route navigation.

The visual port itself requires no new Supabase migration or endpoint. Changes to intake and canonical consent/PDF policy are independently integrated by the other release owners; PDF-generating Edge Functions require their normal backend deployment if changed.

## Validation

The dedicated homepage guard runs against actual server-rendered React output and rejects missing/hidden policy conditions, changed prices or GST treatment, a different refund clock, incorrect policy links, a missing declined-offer boundary, duplicate policies and added unqualified claims. The admission is restricted to the reviewed English homepage context and does not broaden article, other-route or localized claim rules.

At integration handoff:

- Homepage snapshot guard: 37 positive/negative checks passed after the canonical policy merge, including rejection of both superseded offer-receipt wording and a customer-rejection clock.
- Existing public-offer guard: 186 checks passed.
- Full application TypeScript check and Contrast Guard passed.
- Vite production compilation passed during integration; the final full npm build and browser/prerender verification are owned by the release coordinator.

The checked-in English root snapshot initially still contained the prior hero and must be refreshed from the integrated page before final full-tree snapshot validation. The new guard intentionally does not excuse a stale standalone canonical notice on the homepage. Generated snapshots, locale approval records, caches and deployment state are not automatically approved by this visual change.
