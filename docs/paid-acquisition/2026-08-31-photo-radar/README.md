# Photo Radar acquisition pack — August 31, 2026

Prepared, paused, and **not imported**. No account, billing, conversion action, budget or ad delivery was changed. This pack does not authorize spending. The previous account setup stopped before billing submission; see the [account setup record](../2026-08-30/google-ads-account-setup.md).

The offer is **Rapid Resolution: Photo Radar — $79 CAD + 5% GST ($82.95 total)**. It covers eligible Alberta automated camera notices mailed to a registered owner under TSA s.160(1), including photo radar speed and red-light camera notices. No demerits, no insurance impact: only the fine is at issue. Fabsy enters the not-guilty plea, requests disclosure and pursues a Crown reduction or withdrawal; the client approves any deal. No trial, no success fee, no insurance report, and no promised outcome. Government fines are separate; the service fee is not refunded based on outcome.

## Files and import boundary

| File | Use |
| --- | --- |
| [01-campaigns.csv](01-campaigns.csv) | One paused campaign manifest. **Budget is blank: do not import this file yet.** Obtain a real approved budget before creating the campaign. Zero is not a substitute for a valid Google Ads budget. |
| [02-ad-groups.csv](02-ad-groups.csv) | Three paused ad groups: Calgary, Edmonton and Alberta query intent. |
| [03-keywords.csv](03-keywords.csv) | 78 paused keywords: 39 phrases supplied once as Exact and once as Phrase. |
| [04-responsive-search-ads.csv](04-responsive-search-ads.csv) | Three paused RSAs, each with 15 headlines and four descriptions, plus pinned mandatory text. |
| [05-negative-keywords.csv](05-negative-keywords.csv) | 44 campaign-level negatives, using a separate selected-destination import. Never import at account level. |
| [launch-settings.json](launch-settings.json) | Settings worksheet, unassigned budgets, conversion contract and decision thresholds. These are not verified account settings. |
| [meta-copy.json](meta-copy.json) / [meta-creative-brief.md](meta-creative-brief.md) | Three Meta text variants and production instructions; no ads, images or audiences created. |
| [launch-checklist.md](launch-checklist.md) | Destination, checkout, conversion, account and activation gates. |
| [measurement-plan.md](measurement-plan.md) | Paid-purchase measurement, CAC decisions and first-20 ATE review. No live measurements. |
| [destination-audit.json](destination-audit.json) | Public HTTP observation and explicit limits of that check. |
| [validate.py](validate.py) | Offline validation of copy lengths, prices, scope, match types, exclusions, pins and paused state. |

After budget/account authorization, create or import a **paused** Search shell using the exact campaign name, then import the ad groups, keywords and RSAs in order. Review each Editor import preview and map the headers if the installed Editor requests it. For negatives, select **only `ATE-Photo-Radar-Alberta-20260831`**, open campaign-level negative keywords, and use **Make multiple changes → Use selected destinations → Add as campaign-level negative keywords** for the two-column worksheet. Confirm campaign scope before applying. Negative criteria do not have a pause status; they stay inert because this new campaign stays paused. Do not apply them to an existing campaign. [CSV import](https://support.google.com/google-ads/editor/answer/30564?hl=en), [negative-keyword destinations](https://support.google.com/google-ads/editor/answer/30553?hl=en)

No account, advertiser or conversion IDs are invented. Dates, budget type, actual budget amount and a zero-conversion stop-loss remain unassigned. `Maximize conversions` in the manifest is conditional on the correct paid Photo Radar goal passing validation; it is not evidence that bidding is ready.

## Search structure and copy controls

One province campaign keeps the initial experiment together. Target **Alberta, Canada**, using **Presence: people in or regularly in the targeted location**, not the broader interest setting. Google Search only; Search partners and Display off. City ad groups describe the search query, not separate geographic catchments. An Edmonton or Calgary query can come from elsewhere in Alberta, and generic Alberta keywords can overlap city intent. Inspect actual matched queries and geographic reports after an authorized launch. [Google location options](https://support.google.com/google-ads/answer/1722038?hl=en)

Every ad group includes photo radar, red-light camera, intersection safety camera and “owner of motor vehicle” terms. The Alberta group also includes general camera-ticket queries. Exact and Phrase can match close variants; neither guarantees a literal query. Bare camera/location searches are a limited hypothesis, not demonstrated purchase intent. Review them separately and narrow them if they attract research instead of paid eligible files. [Google keyword matching](https://support.google.com/google-ads/answer/14996023?hl=en)

The RSAs pin the city/product headline to position 1, the **$79 + GST / no success fee** headline to position 2, and the scope/price/limits description to position 1. GST is in the pinned description as well as the price headline. Unpinned assets still make sense on their own. Headlines stay within 30 characters, descriptions within 90, and display paths within 15. Keep pins intact even if the ad-strength score drops; review mobile previews for truncation. [Google RSA specifications and pinning](https://support.google.com/google-ads/answer/7684791?hl=en)

Do not attach generic account assets that advertise the $198 service, IIR, a bundle, trial representation or insurance savings. Do not enable dynamic keyword insertion, unreviewed text customization, keyword/URL expansion or automatic recommendations. The ad has no speed promise: the landing page explains that Fabsy acts within 48 hours **after complete, readable disclosure is received and matched**, not within 48 hours of purchase or before the Crown responds.

## Negative-keyword handling

Do **not** inherit the August 30 campaign's photo-radar/red-light exclusions. Inspect existing account-level negatives and shared lists before launch; a conflicting global negative must be reviewed separately, not silently removed from unrelated campaigns.

This list excludes payment-only searches mainly with **Negative exact**, so a query such as “should I pay or fight a photo radar ticket” is not blanket-blocked by `pay`. Generic insurance shopping is excluded with exact terms; `insurance` itself is not a negative because the direct “does photo radar affect insurance” answer can qualify a buyer. The phrase exclusions concern clearly different tickets, criminal matters and camera hardware. Do not add blanket `ticket`, `camera`, `photo radar`, `red light`, `insurance`, `owner`, `pay`, `Calgary`, `Edmonton` or `Alberta` negatives.

## Claims and evidence

The eligibility check is the hook. Do not say photo radar is now illegal, all speed-on-green tickets are invalid, a missing record automatically voids a notice, or savings will exceed the fee. Do not forecast low CPC, low competition, conversion rate or wins from this pack.

The [verified legal-source notes](../../photo-radar/legal-sources.md) support the scope and insurance answer. The [current CPS explanation](https://www.calgarypolice.ca/public-safety/traffic-and-road-safety/automated-traffic-enforcement.html) limits the no-demerit/no-insurance result to registered-owner camera notices. [Alberta's ATE policy](https://www.alberta.ca/photo-radar-alberta) restricts default speed sites but allows approved exceptions and treats red-light enforcement separately. Calgary has documented speed-on-green exceptions. Edmonton's current five-minute rule is verified; a current Calgary equivalent still needs offence-date authority. None is used as an automatic invalidity claim in the ads.

Run `python3 docs/paid-acquisition/2026-08-31-photo-radar/validate.py` from the repository root. Passing means the **draft assets** pass local checks. It does not mean the production site, Ads account, conversion delivery or policies are approved. `--require-launch-ready` deliberately fails until the outstanding launch gates are resolved.
