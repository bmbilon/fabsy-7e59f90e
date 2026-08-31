# Rapid Resolution paid launch pack

Prepared August 30, 2026. **Campaign preparation only: do not activate spend.** No campaign assets in this pack have been imported, posted, enabled, or charged. The separate privacy source publication below does not activate ads. Prices and proposed budgets are CAD.

**Crown-rejection timing correction, August 31 — prepared, not live:** the fee remains payable upfront. If the Crown rejects Fabsy's efforts to reduce the original fine or demerits or obtain withdrawal, and none of those improvements is obtained, Fabsy refunds the full service fee and GST actually paid. The refund is issued within 30 days of Fabsy receiving that rejection. This includes the full bundled fee and GST after any Pro discount; standalone reports and government fines are excluded. Payment and an initial or unchanged offer before that rejection do not start the clock. No legal outcome is guaranteed. Publish matching offer, terms, service authorization and checkout copy before these drafts run. No final-offer requirement, minimum reduction, customer claim deadline or plea-acceptance condition is added. See [messaging direction](messaging-direction.md).

**Earlier Google measurement activation — August 31, 2026, 14:07 UTC, historical:** that production release made GA4 `G-26G8CMWTKY` and Ads `AW-18419256057` available only after explicit consent. Source `3a187b2d6f5fa72e9bb28a4fab55d45279bfce0e`, generated main `cd5eef208e4ade776e4a947278dbad29edae77f0`, and [production Pages deployment](https://fa1d2d1a.fabsy-9qa.pages.dev) are recorded in the [dated activation receipt](../2026-08-31-photo-radar/measurement-activation-receipt.json). Build/Deploy `33397537321`, Prerender `33397537324` and FAQ `33397537305` all succeeded. This is the earlier completed measurement release, not publication or verification of the current Crown-rejection timing correction.

The isolated pre-release real-Google request matrix passed **11/11**. Independent live Tag Assistant connected and observed GA4 **Page View** and both intended destinations. All four consent defaults were denied; opt-in granted analytics/ad storage and `ad_user_data`, while `ad_personalization` stayed denied. The checked private-intake transition had no Google script elements and an empty referrer. Tag Assistant was stopped, measurement permission withdrawn, and clean-page cleanup completed. These are page-view/consent/boundary checks, **not real paid-purchase ingestion, matching or attribution evidence**. Both purchase actions remain Secondary; no campaigns, spend or Primary-action change occurred. For this Crown-rejection timing correction, website publication is still pending. Earlier product/capture-guard evidence does not verify the new wording. The advertising budget/test cap remain unapproved. The detailed receipt preserves the limits of each check and is linked alongside, not added to the original 15-entry RR ZIP.

**Earlier privacy publication, August 31 — historical:** the exact ten-file source patch was published as `1bc4b5f4efe0d5e347d227cff373cb80fd406588` on `f628961abd359aed9b6c248902f637f0547f8bef`; see the [Google measurement release record](../2026-08-31-google-activation/README.md). Build/Deploy, Prerender and FAQ CI passed, and that release served `index-DjtAFHXE.js` with the gate and deduplication code and no AW destination. **At that release, both GA4 and Ads were OFF on fresh loads:** `VITE_GOOGLE_MEASUREMENT_ENABLED` was unset, the AW secret was absent, and both purchase-label secrets were retained. That disabled release has since been superseded by the consent-gated activation recorded above. Paid-purchase delivery remains unverified.

Live home-to-private-intake navigation and English plus seven localized invalid-receipt checks showed no Google script elements. No Google conversion, payment or intake submission was made. Enabled-tag/private-SPA network behavior and consent behavior were **not cleared by those initial disabled-tag checks**; the later activation checks are recorded above. This is not a claim about all other analytics; the existing Cloudflare beacon is unchanged. The initial prepared handoff and original August 30 documentation-only/no-application-code-change statements are historical, superseded for publication status by this dated release record. Campaign drafts, proposed budgets, Secondary actions and the no-spend state are unchanged. The newer record is linked in the repository, not added to this pack's 15-entry ZIP.

The recommended first test is Google Search for people seeking traffic-ticket help: Calgary, Edmonton, and the rest of Alberta, with two ad groups per campaign (general ticket disputes and speeding). Start with a proposed **$100 combined average daily budget** after the gates below pass. This is a recommendation for Brett to review, not budget authorization.

## What is ready

| File | Purpose |
| --- | --- |
| `01-campaigns.csv` | Three paused Search campaign drafts, $40 / $40 / $20 average daily budgets |
| `02-ad-groups.csv` | Six paused ad groups |
| `03-keywords.csv` | Exact and phrase keywords; city keywords only in their matching metro |
| `04-responsive-search-ads.csv` | Six paused RSAs with pinned fee-refund promise, price/GST and Crown-rejection/no-improvement condition; Court/Crown handling remains supporting copy |
| `05-negative-keywords.csv` | Payment/lookup, out-of-scope and pilot-holdout negatives; apply to the three pilot campaigns only |
| `06-assets.csv` | Sitelink and callout copy worksheet, not an Editor import file |
| `launch-settings.json` | Manual account settings and approval gates not supplied by the CSVs |
| `social-copy-drafts.md` | Copy to review for a later prospecting test; no audiences or ads created |
| `messaging-direction.md` | New fee-refund policy, full bundle/Pro scope and remaining service/claim boundaries |
| `site-readiness.md` | Local offer migration and release findings |
| `measurement-readiness.md` | Purchase attribution and conversion implementation findings |
| `campaign-review.md` | Corrections to the supplied build sheet and official sources |
| `live-http-audit.json` | Timestamped public production HTTP checks; no customer data |
| `validation.json` | File checks only; not ad approval, an account import, or launch approval |
| `validate.py` | Offline reusable copy/control validation; kept beside the original 15-entry ZIP, not added to it |

## Example Search ad

**Ticket Reduced Or Fee Refunded | Rapid Resolution: $198 + GST | Fabsy Handles Court & Crown**

Crown rejects Fabsy's efforts; no fine/demerit cut or withdrawal: fee refund. See terms.

Pay upfront. Refund within 30 days of Fabsy receiving the rejection. No outcome promise.

This illustrates one combination; later headlines and descriptions may not appear. The refund headline is pinned to position 1, price/GST to headline position 2, and the Crown-rejection/no-improvement condition, refund and terms to description position 1. Description 2 states upfront payment and the exact 30-day clock from Fabsy receiving the rejection; payment and an initial/unchanged offer do not start it. Court/Crown handling, client approval and separate trials/fines remain supporting copy. Do not use blanket no-court, no-English or no-appointment claims. The refund-terms sitelink must lead to the matching published policy.

## Gates before the first dollar

| Priority | Finding on August 30 | Required evidence before activation |
| --- | --- | --- |
| P0 | `https://fabsy.ca/rapid-resolution` renders the site's 404 screen even though HTTP returns 200 | Real landing page loads on desktop and mobile, CTA enters the correct intake, no overflow or form-blocking errors |
| P0 | Live homepage, services, and purchase terms still promote the retired $149 review / $488 representation offer | Deploy a reviewed, consistent release; check human and crawler responses for the new offer, terms, metadata, and redirects |
| P0 | This checkout has no `/terms-of-purchase` route although production has that page | Reconcile the deployed purchase terms with this branch; retain clear price, scope, payment and refund terms at a working linked URL |
| P0 | RR checkout does not persist acquisition details; the paid webhook does not deliver ad conversions; bundle returns bypass the current purchase event | RR and bundle each create exactly one verified paid-purchase conversion, including when the browser never returns; confirm it in the chosen platform diagnostics |
| P0 | Legacy assessment entry points remain callable in local backend source | Reject new retired-offer purchases while preserving existing receipts, refunds, paid orders and historical access |
| P0 | Account ownership, conversion action, consent, location settings and spending approval have not been checked | Complete the account review below and obtain explicit authorization before posting/enabling campaigns or scheduling spend |
| P1 | Broader local snapshot validation reports unresolved issues | Review the release findings; required landing pages, checkout, and published claims must pass before release |

The table records the August 30 audit, not a fresh claim that every issue persists. On August 31, a normal browser successfully loaded `/rapid-resolution` with the current $198 / $229 / $49 offers, and its CTA opened step 1 of `/submit-ticket`. The homepage also showed current pricing. The Ads account is active, billing and tax status are confirmed, auto-tagging is on, and both paid-purchase actions are Secondary. Google completed review of Execom Inc.'s incorporation/name-change packet and now displays **Advertiser identity verified**; no additional affiliation task is listed. That desktop account/destination check did not verify mobile behavior, later intake/checkout steps or actual purchase measurement. The later privacy and activation checks are recorded above; no ad-policy, real paid-purchase or spending gate was waived.

The existing workspace contains substantial unrelated changes. The original August 30 preparation added a separate documentation folder and left application code, migrations, and production untouched. The later privacy source publication used the exact ten-file patch described above, not a blind push of the current working tree.

## Proposed pilot

| Campaign | Location to configure manually | Average/day | 14-day planning amount |
| --- | --- | ---: | ---: |
| RR-Pilot-Calgary-202608 | Calgary + 40 km | $40 | $560 |
| RR-Pilot-Edmonton-202608 | Edmonton + 40 km | $40 | $560 |
| RR-Pilot-Alberta-202608 | Alberta, excluding the same two metro catchments | $20 | $280 |
| Total | Non-overlapping areas | $100 | $1,400 |

The original sheet's $220/day is a $3,080 planning amount over 14 days. The narrower pilot reduces the initial number of channels and intent groups so results are easier to interpret. The split is a working hypothesis, not an estimate from Keyword Planner. Check Alberta search volume and CPC forecasts before approving the budget; low volume may justify consolidating campaigns.

**$1,400 is not a hard cap when using average daily budgets.** Most Google campaigns can bill up to twice their average daily budget on a day ($200 combined here). If a firm 14-day cap is required, choose campaign total budgets at campaign creation ($560 / $560 / $280 with approved dates), where available. Those budgets have no daily limit and cannot be substituted for an existing daily-budget campaign. Decide before importing campaign rows; do not create the same campaigns twice. Platform availability and billing settings still need account verification. [Spending limits](https://support.google.com/google-ads/answer/10486637?hl=en-GB), [campaign total budgets](https://support.google.com/google-ads/answer/10486938?hl=en).

Use Maximize Conversions only after the paid-order action is verified and selected for these campaigns. Uploads, calls, contact forms and checkout starts remain secondary observation metrics. Do not automatically set tCPA to $70 on day eight or on the thirtieth purchase; evaluate recent attributed orders, reporting delay and contribution margin first. The CSV's strategy is a draft, not proof that the goal is configured.

Hold competitor, photo-radar, commercial, Meta, Reddit and YouTube spending out of this first test. The negative list includes explicit competitor, automated-enforcement and commercial-driver holdouts because generic phrase keywords can otherwise match them. Dedicated insurance-information groups are also deferred; decision queries that include insurance may still match a core keyword. Review actual search terms for remaining drift. Each expansion can be added as a separate, measurable hypothesis after the core flow works. Hold ticket-upload-based remarketing pending platform classification and privacy review; ordinary consent to handle a ticket is not permission to disclose the person's legal situation to ad platforms.

## Import and account review

1. Confirm the intended Google Ads account, CAD currency, timezone, billing, advertiser verification and existing campaigns. These names are proposed new campaigns; resolve any name collision before importing.
2. Decide daily versus total budgets and approve launch/end dates. For a total-budget test, create the three paused campaign shells with total budgets first and skip `01-campaigns.csv`.
3. Import `01` through `04` in order into Google Ads Editor for review. Inspect the column mapping and errors; **keep campaigns, ad groups, keywords and ads paused**. These files have only been checked locally, not round-tripped through an authenticated Editor account. [Google's import instructions](https://support.google.com/google-ads/editor/answer/30564?hl=en).
4. Apply `05-negative-keywords.csv` through **Keywords, Negative → Make multiple changes → Use selected destinations → Add as campaign-level negative keywords**, selecting only the three pilot campaigns. Paste the keyword/match-type columns and preview the result. This is not a generic account-level CSV import. The file intentionally has no account-wide scope or pause field: negative keywords cannot be paused. Verify exact versus phrase matching and do not apply it to unrelated campaigns. [Google's negative-keyword workflow](https://support.google.com/google-ads/editor/answer/30553?hl=en).
5. Configure the locations in the table and inspect the resulting map. Use people **in or regularly in** the locations, not location interest. Exclude equivalent metro areas from the provincial campaign; verify supported exclusions rather than inventing geographic IDs or assuming radius exclusions are supported. Geo targeting does not insert city words into keywords.
6. Confirm Google Search only, Search Partners off, Display off, exact/phrase only, all-day serving, English creative, and no automated broad-match expansion, dynamic keyword insertion, AI text customization or unreviewed assets. The first two headline positions are intentional; verify the imported pins and the required Crown-rejection/no-improvement condition, refund and terms in Description 1.
7. Confirm a single RR paid-order primary conversion covering RR and bundles, with purchase counting set to **Every** and transaction-ID deduplication verified. Document the attribution model, click-through conversion window and normal reporting delay. Keep report-only purchases, uploads and calls out of this campaign's primary goal; do not count both a Google Ads tag and a GA4 import of the same sale as two primary actions. “Every” counts separate paid orders; new-client CAC still requires internal customer deduplication. [Google conversion counting](https://support.google.com/google-ads/answer/3438531?hl=en), [transaction-ID deduplication](https://support.google.com/google-ads/answer/6386790?hl=en).
8. Enable auto-tagging. The RSA suffix uses literal campaign names plus supported `{adgroupid}`, `{creative}` and `{keyword}` parameters. Test URL expansion and click-ID survival through intake and Stripe. Do not use `{campaign}` or `{adgroup}`. Do not put customer names, emails, ticket details, IDs or tokens in UTM fields. [ValueTrack](https://support.google.com/google-ads/answer/6305348?hl=en).
9. Add the reviewed assets from `06-assets.csv` manually. Review each target page before use. Only add the call asset after confirming the number and staffing; keep call conversions secondary. Review dynamic/account-level assets too.
10. Complete test-mode checkout, webhook replay, no-return, refund and consent checks in the measurement document. Then review the concrete account preview, campaign policy status and approved spend with Brett before posting or enabling anything.

## Review cadence and economics

For the first two weeks, review search terms, out-of-area traffic, spend, checkout failures and purchase diagnostics each business day. Restrict irrelevant queries by their actual intent; do not blanket-block `pay`, `free`, `renewal`, province names or every query containing those words. Pause spend promptly if the landing page or payment measurement breaks.

Use paid **new RR clients**, deduplicated internally, for CAC; use paid orders for CPA. Count a bundle as one order/client, not as both RR and report sales. Reconcile attributed purchases with Stripe; keep unattributed orders separate. Do not add channel-reported conversions together as unique customers.

| Metric | Definition / treatment |
| --- | --- |
| Net service revenue | Actual amount collected excluding GST, less refunds; report legacy credits separately |
| AOV | Net service revenue / paid orders, with RR, bundle and report-only splits |
| Purchase CPA | Campaign spend / attributed paid RR or bundle orders |
| New-client CAC | Campaign spend / attributed first-time RR clients; not uploads or all purchases |
| Bundle rate | Bundled RR orders / all paid RR orders; 60% is a target, not an observed rate |
| Allowable CAC | For planning: service revenue excluding GST, less a refund allowance, delivery labour, processor fees, other variable costs and desired contribution. When using realized net revenue, do not deduct the same refunds again. |
| Operational coverage | Deadline-sensitive submissions acknowledged and reviewed within the staffing SLA; business hours must be defined |

At the proposed 60% bundle mix, pre-tax AOV is `$198 × 40% + $229 × 60% = $216.60`. A $75 CAC would leave $141.60 **before** labour, processor fees, refunds and other delivery costs. This is not gross profit. No acquisition cost or capacity figure in the supplied sheet has been validated against actual business data.

Use $75 only as a provisional review trigger until allowable CAC is known. A keyword spending $150 without a paid order merits an investigation once the normal conversion delay has elapsed, not an immediate claim that it fails economically. Increase budgets gradually after multiple completed conversion cycles and enough paid orders to judge relevance and margin. Do not double budgets from one cheap conversion or follow a calendar-driven ramp automatically.

## Recheck after release

Repeat the public-page checks for `/`, `/rapid-resolution`, `/services`, the resolved purchase-terms URL, and both retired assessment URLs, using ordinary and crawler user agents. Verify visible content as well as HTTP status: the recorded August 30 landing-page failure was a soft 404. Review pricing context rather than deleting every `149` substring from historical records or ticket fine examples.

Run `python3 docs/paid-acquisition/2026-08-30/validate.py --write` to refresh the local validation record, then rebuild the same 15-entry ZIP. Local validation in `validation.json` covers lengths, pausing, exact/phrase match types, price consistency, URL placeholders and basic negative conflicts. It does not prove serving eligibility, search demand, privacy compliance, live conversion delivery or successful deployment.
