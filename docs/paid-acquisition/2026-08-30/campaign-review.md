# Campaign review — 2026-08-30

**Crown-rejection timing correction, August 31 — prepared, not live:** the fee remains payable upfront. If the Crown rejects Fabsy's efforts to reduce the original fine or demerits or obtain withdrawal, and none of those improvements is obtained, Fabsy refunds the full service fee and GST actually paid. The refund is issued within 30 days of Fabsy receiving that rejection. This includes the full bundled fee and GST after any Pro discount; standalone reports and government fines are excluded. Payment and an initial or unchanged offer before that rejection do not start the clock. No legal outcome is guaranteed. Publish matching offer, terms, service authorization and checkout copy before these drafts run. No final-offer requirement, minimum reduction, customer claim deadline or plea-acceptance condition is added. See [messaging direction](messaging-direction.md).

This timing-correction pass did not process a refund or payment, change a provider account, or publish the revised offer. Earlier product and measurement releases below remain historical evidence, not verification that the corrected timing is live. No new browser or purchase test was performed.

**Earlier measurement follow-up — August 31, 2026, historical:** the separately authorized Google activation was deployed, with GA4 `G-26G8CMWTKY` and Ads `AW-18419256057` loaded only after explicit consent. The [dated activation receipt](../2026-08-31-photo-radar/measurement-activation-receipt.json) records successful CI, the isolated real-Google 11/11 request matrix, independent live Tag Assistant Page View/consent/private-intake checks, and completed withdrawal/debug cleanup. This supersedes the earlier disabled/no-tag/deployment-pending status; it does not prove paid-purchase receipt or attribution. Both actions remain Secondary and no campaign spend occurred. For this Crown-rejection timing correction, website publication is still pending. Earlier product/capture-guard evidence does not verify the new wording. Advertising budget/test-cap approval is also outstanding.

**Recommendation: prepare paused Google Search campaigns; do not activate the pasted multichannel schedule.** This review checks the supplied Rapid Resolution build sheet against current official documentation. Budgets below are proposals in CAD, not authorization or forecasts. No ad account, customer list, or live customer data was accessed.

The production offer, landing page, checkout, purchase attribution, and privacy gates in the application audit must pass before activation. A usable ad import does not establish readiness to spend.

## Correct before building

| Issue in the supplied sheet | Required correction |
| --- | --- |
| `utm_campaign={campaign}&utm_content={adgroup}` | These are not documented Google ValueTrack parameters. Use a literal campaign slug, or `{campaignid}`; use `{adgroupid}`, `{creative}`, and `{keyword}` for their respective fields. Test actual substitution and preserve click identifiers through checkout. |
| “The city modifier is added automatically by geo” | Location targeting determines eligible users; it does not append city words to keywords or ordinary ad text. Write city copy explicitly. Location insertion is a separate feature requiring its own configuration. |
| Account negatives `pay`, `paying`, `free`, `renew`, `renewal` | Do not import these as blanket negatives. `pay` blocks a valuable query such as “should I pay or fight a speeding ticket”; `renewal` conflicts with the insurance-report offer. Exclude demonstrated payment-only intent using narrower, explicitly chosen match types. |
| “Anything with pay … goes negative immediately” | Review the full query and intent. For example, an exact negative `[pay traffic ticket]` excludes that exact search without excluding every longer decision query containing those words. Negative keywords do not expand like positive keywords; explicitly consider separate word forms. |
| Four campaigns, seven repeated ad groups, competitor ads, Meta, Reddit, then YouTube | Concentrate the initial test on the core dispute and speeding groups. Small budgets divided across so many different intents will give weak evidence about where paid customers come from. |
| “Demerits / insurance (high intent, cheaper)” | This is an unverified assumption. “How many demerits” is an informational query, not evidence of willingness to buy representation. Keep this group out of the initial purchase test. |

Sources: [Google ValueTrack reference](https://support.google.com/google-ads/answer/6305348?hl=en), [location insertion](https://support.google.com/google-ads/answer/9773001?hl=en), [negative keyword matching](https://support.google.com/google-ads/answer/2453972).

An example final URL suffix, using a literal campaign name, is:

```text
utm_source=google&utm_medium=cpc&utm_campaign=rr_calgary&utm_content={creative}&utm_term={keyword}&adgroup_id={adgroupid}
```

Keep Google auto-tagging enabled and test the resulting URL. UTM fields by themselves do not connect a Stripe payment to an attributed Google purchase.

## Copy and asset corrections

The supplied RSA headlines and descriptions were counted, including spaces and punctuation. Google allows up to 15 headlines of 30 characters and four descriptions of 90 characters. All four supplied descriptions fit; the first is exactly 90 characters. The competitor headline **“No Hidden Fees. No Success Fee.” is 31 characters** and must change, for example to “No Hidden Fees.” [Google RSA specifications](https://support.google.com/google-ads/answer/7684791?hl=en-EN).

Two other assets exceed their separate limits:

- “48h Action After Disclosure” is 27 characters; callouts allow 25. Omit this abbreviated timing claim and keep the complete condition in a description.
- “Trial Representation (quoted)” is 29 characters; sitelink text allows 25. Use “Trial Representation” and explain the separate quote in its description.

Sources: [callout limits](https://support.google.com/google-ads/answer/6079510), [sitelink limits](https://support.google.com/google-ads/answer/2375416?hl=en).

| Supplied language | Safer treatment |
| --- | --- |
| “Keep Demerits Off Your Record”; “Protect Demerits & Insurance” | Remove. These suggest a result that conflicts with the sheet's own prohibition on promised reductions or withdrawals. Describe disclosure and Crown negotiation instead. |
| “No Court”; “No Trial Needed” | Remove. The offer excludes a trial; it cannot establish that a customer's matter will never require one. State “Trial quoted separately” in the offer details. |
| “We Appear So You Don't Have To” | Do not use as an unconditional headline. Explain where agent representation is permitted and what is actually included. |
| “48h Action After Disclosure” | The condition is **complete disclosure**, and the promise concerns action, not an outcome. Use the full condition wherever this timing is advertised, only after operations confirms it can be met. |
| “Upload … in 60 Sec”; “Quote in Minutes” | Treat as unverified service claims until the actual mobile journey and response process substantiate them. |
| “Human Handled, Not Software” | Prefer a precise statement of human agent involvement. Avoid implying that no software or automation is involved. |
| “The conviction can cost … every year”; “know exactly where you stand”; “hits … your next job” | Avoid an implied predictable insurance or employment result. Describe a report about possible insurance considerations, subject to the insurer and circumstances. |
| `$198` / `$229` in social copy | State `+ GST` consistently with the landing page and checkout; the bundle is a $31 service-price increment, not a standalone $31 report. |

The pricing, no-success-fee policy, scope, human involvement, and operational timing still require business verification. This is a copy review, not a determination of legal eligibility or case outcomes.

## Alberta facts that change the messaging

Alberta's demerit period runs for two years **from conviction**, not from the ticket date. The province distinguishes removal of demerit points from removal of a conviction. Do not suggest that insurance consequences necessarily end when points expire. [Alberta demerit driving suspension guidance](https://www.alberta.ca/demerit-driving-suspension).

Photo-radar tickets need separate messaging: Calgary Police states that its automated-enforcement tickets carry no demerit points and do not affect driving records or insurance. Reusing the general insurance/demerit RSA assets in a photo-radar group would therefore mislead. Keep photo radar out of the initial acquisition test and assess its separate customer economics before adding it. [Calgary Police automated-enforcement guidance](https://www.calgarypolice.ca/public-safety/traffic-and-road-safety/automated-traffic-enforcement.html).

The 2025 photo-radar policy change is real, with the guidelines effective April 1, 2025 and an exemption process. That fact alone does not establish that a particular ticket is invalid. The “photo radar 2025” creative is also dated for an August 2026 launch. [Current Alberta photo-radar guidance](https://www.alberta.ca/photo-radar-alberta).

## Retargeting and customer-data gate

Google's relevant sensitive category is specifically **commission of a crime**: criminal record, criminal allegations, crimes, or charges. If a service falls within that category, advertiser-curated audiences such as Customer Match and website data segments are restricted. This is **not evidence that every routine provincial traffic-ticket service is automatically classified as criminal defense**. Keep uploaded-ticket remarketing and customer-list audiences out of the initial build while reviewing Fabsy's actual service/landing-page classification. [Google category definition](https://support.google.com/adspolicy/answer/16701956), [targeting restrictions](https://support.google.com/adspolicy/answer/143465?hl=en).

Meta's customer-list terms require the necessary rights, permissions, lawful basis, and observance of opt-outs, even when identifiers are hashed. A ticket upload for service delivery does not by itself establish those advertising permissions. Do not export uploaders or construct the proposed “uploaded, no purchase” audience at this stage. [Meta customer-list Custom Audiences terms](https://www.facebook.com/legal/terms/customaudience/update).

The official Meta Business Tools Terms and personal-attributes pages could not be fully retrieved during this review. Their current application to the proposed CAPI payloads and “You uploaded a ticket” wording remains a manual review gate; no blanket conclusion that all traffic-ticket ads are prohibited is made. Review the [Business Tools Terms](https://www.facebook.com/legal/technology_terms) and [privacy/personal-attributes ad standard](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/) in the account context before enabling Meta.

Any later measurement implementation needs an approved payload allowlist and consent handling. Do not include ticket images, names from ticket documents, licence or plate numbers, offence narratives, court dates, or other case details in advertising events, URLs, or audience labels. Hashing an identifier is not a substitute for checking the permitted use of the underlying data.

## Proposed initial spend and decision rules

| Stage | Scope | Proposed average daily budget | Release condition |
| --- | --- | --- | --- |
| Preparation | Paused Google Search drafts | $0 | Offer/landing page, checkout, attribution, privacy, and account settings verified |
| Initial pilot | Calgary + 40 km: core dispute and speeding | $40 | Brett approves activation and budget after the gates pass |
| Initial pilot | Edmonton + 40 km: core dispute and speeding | $40 | Same gate |
| Initial pilot | Rest of Alberta, excluding the same metro areas | $20 | Same gate; verify exclusions in the platform |
| Later expansion | Search growth, then a separately approved Meta prospecting test | Not committed | Mature purchase data, positive contribution after ads, stable service delivery, and channel-specific measurement/policy checks |

The $100/day total gives a **$1,400 planning estimate for 14 days**, compared with $3,080 for the pasted $220/day schedule. It is not a 14-day billing cap: Google may spend up to twice the average daily budget on a given day, with separate monthly limits. The proposed Google settings can therefore permit $200 in a day. Specify the tolerated overdelivery and any required hard spending control before activation; an alert alone does not guarantee a cap. [Google spending limits](https://support.google.com/google-ads/answer/10486637?hl=en-EN).

Use location **Presence** for the initial local test, with exact/phrase keywords, Search partners and Display expansion off, and no audience-based retargeting. Google's default location option can include people outside Alberta who merely show interest in it; Presence narrows that audience, although location detection is not perfect. Location does not prove that a customer's ticket is an eligible Alberta matter, so retain intake eligibility checks. [Google location options](https://support.google.com/google-ads/answer/1722038?hl=en), [geographic targeting limitations](https://support.google.com/google-ads/answer/2453995?hl=en).

Optimize toward verified paid orders; free uploads and phone clicks should be diagnostic secondary actions unless explicitly chosen otherwise. Do not automatically switch to a $70 tCPA after seven days or the thirtieth conversion. Google permits tCPA without conversion history and recommends at least 30 conversions for more reliable evaluation; that is not a compulsory switch threshold. Set targets from business economics and observed performance, accounting for conversion lag. [Google Target CPA guidance](https://support.google.com/google-ads/answer/6268632?hl=en).

Replace automatic doubling below a seven-day $50 CAC with a review of mature click cohorts, deduplicated paid orders, refunds, contribution, and intake quality. Immediately stop for broken checkout/tracking, misleading prices, or ineligible traffic. Do not scale merely because a small or incomplete sample happens to look inexpensive.

The sheet's $50/$75/$90 thresholds, 60% bundle rate, 50+ clients/day capacity, and Alberta search-inventory ceiling are **unverified planning assumptions**. Set the CAC ceiling from revenue excluding GST, less payment fees, variable service labour/case costs, refund allowance, and the contribution the business needs to retain. Confirm staffing and response capacity before increasing volume. Use Keyword Planner and observed impression/share data to test search demand; do not assume Meta or YouTube will supply profitable volume on a calendar schedule.

## Remaining unknowns

No reliable CPC, purchase conversion rate, refund rate, case contribution, historical channel CAC, ad-account approval status, tracking diagnostics, or verified daily case capacity was available to this campaign review. The review produces a defensible test scope and corrections, not a revenue forecast or permission to spend.
