# Meta relaunch: Photo Radar and Rapid Resolution

Historical preparation notes from September 26, 2026. Current $79 copy was corrected September 27; see [the correction receipt](../2026-09-27-refund-scope.md). Historical schedule and approval notes below are not current delivery status.

## Saved Meta draft

- Account: Fabsy Canada, `1102946998970411`.
- Campaign: `DRAFT | Photo Radar | AB | EN | Purchase | 2026-09-26`, ID `120250066894140687`.
- Ad set: `Photo Radar | Alberta | English | Purchase`, ID `120250066894130687`.
- Ad: `Photo Radar | Hefty Fine | Navy v2`, ID `120250066894120687`.
- Campaign, ad set and ad are off. Website conversion, Purchase, dataset `2917050565322500`.
- Alberta; English (All); minimum age 18. No gender restriction was adopted from Fable's attachment. Location-interest expansion disabled.
- Facebook Feed and Instagram feed only. All other placements excluded; limited spending on excluded placements disabled.
- Draft lifetime budget: CA$150, **a proposal awaiting Brett's spend authorization**, not an approved budget. Draft schedule September 26 to October 3, 2026, 2:49 PM MDT; reset the seven-day schedule when actually launching.
- Destination: https://fabsy.ca/photo-radar
- Parameters: `utm_source=meta&utm_medium=paid_social&utm_campaign=photo_radar_relaunch_20260926&utm_content=01-mail-price-v3`.
- Image: `assets/01-mail-price-v3.png`, generated with built-in ImageGen as an edit of the original navy v2. Actual export 1122 x 1402 (approximately 4:5), original crop preserved. Both Facebook Feed and Instagram feed previews visually verified with the complete headline, price and footer. Exact production prompt saved in `image-prompt.txt`. Original files preserved. The ad retains its original creation name despite the revised artwork. Fable's HTML was used as layout/copy input, not uploaded as a production image.
- CTA: Learn more. Text optimization, all AI creative enhancements, relevant-comment additions and automatic brightness/contrast adjustments disabled. Destination optimization, shop/product browsing and browser contact add-ons disabled. Automatically sourced promo codes disabled; all four creative-setup extensions are off.

[Open saved Meta draft](https://adsmanager.facebook.com/adsmanager/manage/ads/edit/standalone?act=1102946998970411&business_id=1716937736206286&selected_campaign_ids=120250066894140687&selected_adset_ids=120250066894130687&selected_ad_ids=120250066894120687)

## Copy saved in the ad

**Headline:** We fight it for $79 + GST

**Description:** You approve any deal.

**Primary text:**

Photo radar ticket? We fight it for $79 + GST.

We review the evidence and pursue a lower fine or withdrawal with the Crown. You approve any deal. No success fee.

$82.95 total, paid upfront. Eligible Alberta registered-owner notices. Government fines separate. Trial excluded. No legal outcome is guaranteed.

Upload your notice to start.

## Fable input: accepted and corrected

Source files: Brett's `Downloads/fabsy-photo-radar-meta-set-v2.html` and pasted review attached in this task. Their historical rules and suggested targeting are creative input, not additional authorization.

Keep the concrete mailed-notice trigger, visible price, short headline, evidence review, Crown negotiation, client control and upload CTA. There is no evidence yet establishing a winning creative; this is an editorial recommendation to test.

Corrections:

- Show **$79 + GST**, with **$82.95 total** in the primary text. Avoid "That's the whole fee" without explaining tax and separate government fines.
- Do not use "That's the window to negotiate" as an interpretation of every notice's response date. A safe later reminder is "Check the response date on your notice. Uploading does not extend it."
- Do not promise savings exceeding the service fee.
- Do not promise a legal outcome or Crown response time.
- Use "You approve any deal," rather than "Nothing happens without your OK," which could misdescribe the separately authorized not-guilty plea and disclosure work.
- Do not assume male-only targeting, video performance, six-ad spending or automatic retargeting is approved or proven from the attachment.
- Keep Stories/Reels excluded until proper 9:16 exports and previews exist. Do not crop disclaimers off the current 4:5 asset.

The applied v3 image uses the mailed-notice/price hierarchy: "Photo radar in the mail?" / "$79 + GST" / "We pursue a lower fine or withdrawal. You approve any deal." The accompanying text describes the work and fee without an outcome refund offer. The image CTA is "Upload your notice" and its footer names paid-upfront pricing, no success fee, separate government fines, trial exclusion, variable results and agent-service status.

## Offer verification

Live public pages checked September 26, 2026:

- https://fabsy.ca/photo-radar
- https://fabsy.ca/terms-of-service#photo-radar-terms

The historical website policy was corrected on September 27: only the $198 Rapid Resolution service carries the outcome refund offer. Camera services have an upfront fee and no promised legal result.

## Measurement verification and launch blockers

The live domain-category Details dialog says `fabsy.ca` is not categorized and no sharing restrictions apply. However the dataset Settings summary still displayed Personal hardship and Core setup On. That discrepancy is not proof that every restriction has cleared.

Events Manager overview, August 29 to September 25: PageView active (22, latest four days earlier); Purchase present (4, latest nineteen days earlier) with no restricted badge observed. Lead was absent and therefore could not be verified. Purchase is selectable in the draft, with a no-activity-in-more-than-seven-days warning.

Latest fetched production code (`origin/main`, `8c21bbdf1`) excludes Photo Radar from Meta measurement independently of consent:

- `src/lib/metaMeasurement.ts`: landing path and purchase allowlists include Rapid Resolution, not Photo Radar.
- `src/components/form-steps/PaymentStep.tsx`: omits Meta attribution for Photo Radar.
- `supabase/functions/create-payment/index.ts`: skips Meta attribution persistence for Photo Radar.
- `supabase/functions/_shared/meta-capi.ts` and `meta-purchase.ts`: content, price and signed purchase validation accept only the existing RR products.
- `supabase/functions/idr-payment-webhook/index.ts`: Photo Radar branch does not enqueue a Meta Purchase.
- Existing CAPI database constraints/RPCs also require a coordinated expansion before Photo Radar can be supported safely.

The relaunch patch adds Photo Radar to the existing consent-first measurement path. Consent settings remain unchanged. The patch is tested locally but is not yet deployed. CAPI must preserve consent, withdrawal, strict signed-payment validation and browser/server deduplication. Never send ticket contents, legal allegations, names or contact data to Meta as conversion payloads. A synthetic production Purchase must not stand in for a verified real checkout.

Before launch:

1. Brett supplies a combined spending limit for Photo Radar and Rapid Resolution. The current consent-first policy is retained; an unanswered opt-out suggestion is not authorization to change it.
2. Deploy the tested Photo Radar browser/CAPI patch backend first, frontend last. Verify a real paid conversion receipt; local synthetic fixtures are not evidence of Meta receiving a live purchase.
3. Confirm the dataset discrepancy is resolved sufficiently for events to flow, and inspect a fresh valid Purchase end to end.
4. Recheck final creative, schedule, budget and Meta publication terms before enabling delivery. Do not publish unrelated pending drafts.

Existing campaign toggles were not changed. An older campaign with `PAUSED` in its name was actually on; its name must not be treated as its delivery state.

## Rapid Resolution added to the relaunch scope

Brett explicitly requested running the Photo Radar ads plus the existing $198 ads. No new spending cap was provided. An async question proposes CA$350 over seven days, split CA$175 per offer, with CA$150 and CA$700 total alternatives. None is authorized until Brett replies.

Existing campaign inspected: `RR | Landing Page A-B | CA$350 | 2026-09-23`, ID `120249996835260687`, campaign off. Its scheduled A/B test remains in progress through September 30. Each ad set has an existing CA$175 lifetime budget; those are historical settings, not a new combined spending authorization.

- A: `RR | A - Original | EN | CA$175 | Sep23-30`, ID `120249996835340687`, original landing page.
- B: `RR | B - Alternate | EN | CA$175 | Sep23-30`, ID `120249996835350687`, alternate landing page. B's inspected ad ID is `120249996835400687`.
- B's full review confirms September 23 00:00 to September 30 00:00 Edmonton time, Alberta, men aged 18–65+, English (US/UK), Facebook feeds, Website Purchase, maximize conversions. A uses the paired original landing-page test. Do not assume historical men-only targeting or the old remaining schedule is the intended relaunch plan.
- The RR03 A and B ads are enabled within the disabled campaign. Their primary text, headline, description and Learn more CTA have been updated as unpublished drafts. Existing artwork retained; visual preview checked. Other paused RR01/RR02/RR03 variants have not been enabled.
- Spend in the inspected September 19–25 period: A CA$6.88, B CA$4.37; three clicks each. This is insufficient evidence to declare a winning landing page or ad.

Recommended relaunch allocation: one English Alberta ad set for each service, with a total cap and end date. Consolidate the RR restart after resolving its old A/B-test schedule; do not silently enable all historical ad sets or publish unrelated drafts.

### Revised RR03 copy saved in both A and B

Headline: **Ticket help: $198 + GST**

Description: **You approve any deal.**

Alberta traffic ticket? Let Fabsy pursue a lower fine, fewer demerits or withdrawal for $198 + GST.

Upload your ticket. We review the evidence and negotiate with the Crown. You approve any deal.

Service-fee refund guarantee: if the Crown rejects our efforts and no reduction or withdrawal is obtained, we refund your service fee and GST. Declining an improved offer does not qualify. Terms apply.

$207.90 total, paid upfront. No success fee. Eligible pre-trial matters only. Government fines and trial representation separate. No legal outcome is guaranteed.

Verified against https://fabsy.ca/rapid-resolution and the existing section 5F refund terms on September 26. The public offer is unchanged.

## Tracking patch validation

- Exact Photo Radar offer: $79 net service value, $3.95 GST, $82.95 total; live signed paid/complete Stripe session only.
- Browser and server use the same SHA-256 checkout-session event ID; consent and withdrawal fencing remain in place.
- Public tagged English `/photo-radar` landings become eligible. Private intake, legal documents, contact details and ticket facts remain excluded from Meta payloads.
- Existing GA4 landing validation admits the same bounded Photo Radar click identifiers, avoiding loss of consented landing traffic when Meta appends `fbclid`.
- Failed/expired Photo Radar checkouts clear attribution through the existing cleanup path.
- New migration: `20260926220000_meta_photo_radar_purchase.sql`, updates the content/value constraints and the existing enqueue function without broadening RPC access.
- Full `npm run test:measurement`: passed after extending Photo Radar fixtures.
- Deno checks for the mapper, create-payment, payment webhook and CAPI worker: passed.
- Local PostgreSQL 17: applied the original Meta schema (omitting only pg_cron installation), terminal-health and click-ID migrations, then the new migration. Verified no-consent no-op, one queue entry across retries, exact net value, cross-product rejection, withdrawal and private RPC permissions. No external events sent.
- Vite development build: passed. TypeScript with ES2021 libraries: passed. The unchanged repository ES2020 configuration reports existing `replaceAll` errors in unrelated files.
- Live database preflight confirms Photo Radar is still excluded before deployment. Supabase source download verified the returned entrypoints against the base commit, but the CLI stopped at shared configuration imports outside its extraction root; those downloads are partial and are not complete deployment-source verification.
