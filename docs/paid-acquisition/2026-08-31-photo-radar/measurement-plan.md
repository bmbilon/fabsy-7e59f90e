# Measurement contract and decision rules

This is a specification, not a report. No Ads or Meta conversion action was created, no live orders were queried, and no account/customer IDs or outcomes were invented. The live first-20 ATE count and median remain pending deployed reporting and actual records.

## One paid Photo Radar purchase goal

Proposed Google Ads action name: **Fabsy paid Photo Radar**, category **Purchase**. Keep it secondary/excluded from bidding until delivery is verified. For this campaign, choose **one** primary route: a direct Google Ads paid purchase event **or** a GA4 import of that same purchase. Do not make both primary. Other Fabsy offers must not enter this campaign's goal.

The purchase condition is a server-confirmed paid `order_type=photo_radar` order, not a visit to `/thank-you`, a free check, a form submit, a checkout session being created, or a client-controlled query parameter. Send `currency=CAD` and service revenue **79**, excluding **3.95 GST**. The checkout total remains **82.95**. Never send the ticket fine as purchase revenue. Test unpaid sessions, wrong SKUs, repeated webhook deliveries and return-page refreshes as well as a valid purchase.

Use **Every** counting for actual purchases and a stable opaque transaction/order identifier to deduplicate repeat delivery of the same order. The identifier must not contain a ticket number, plate, client name or case details. It must stay consistent across any supported browser/server delivery paths and differ across purchases. Google's transaction-ID deduplication is different from counting only one conversion per click. [Google purchase deduplication and counting](https://support.google.com/google-ads/answer/6386790?hl=en)

Confirm permitted attribution survives landing page, intake, Stripe, webhook and confirmation. A paid buyer who closes checkout before returning must not be assumed to have a tracked conversion; test the actual delivery path and document any gap. Retain reconciliation evidence for the paid order, value, currency and duplicate handling. Verify the real destination ID/label and platform receipt, then select the single validated action for this campaign. Reconcile cancellations/refunds and use supported conversion adjustments if required. No live charge is authorized by this validation plan.

The Search suffix uses static campaign/city labels plus supported `{adgroupid}`, `{creative}` and `{keyword}` parameters. Do not substitute invented `{campaign}` or `{adgroup}` macros. Keep ticket/client data out of URLs and tracking events. Confirm auto-tagging and URL tests in the account; this pack does not change them. [Google ValueTrack parameters](https://support.google.com/google-ads/answer/6305348?hl=en)

Meta, if separately authorized, should measure the same paid product with CAD 79 value and its own verified Purchase setup. Deduplicate supported browser/server events within Meta and reconcile platform overlap against internal paid orders. Summing Google-attributed and Meta-attributed customers is not a deduplicated blended customer count. No Meta integration is presumed by this pack.

## Economics

| Measure | Definition / decision |
| --- | --- |
| Paid ticket CPA | Channel spend divided by paid Photo Radar orders in the same mature attribution cohort. Useful, but repeat/fleet tickets are not all new customers. |
| New-customer CAC | Channel spend divided by distinct newly acquired paying Photo Radar clients in the same mature cohort. Use this for the thresholds below. |
| Contribution | Approximately **$72 per ticket** is the user's planning assumption, not a measured margin. Reconcile payment fees, variable delivery cost and refund/rework effects before treating it as fact. |
| Scale | Consider an approved increase only when mature new-customer CAC is **below $35**, tracking is reliable and service outcomes/capacity support it. |
| Hold | **$35 to below $55**: review intent, creative, eligibility rejection and checkout. Do not automatically increase spend. |
| Cut | At **$55 CAC or more** in the agreed mature evaluation window, pause/cut the affected acquisition scope and review. |
| No customers | CAC is undefined, not $0. Apply the separately approved spend stop-loss rather than letting an empty denominator justify continued spend. |

Set the evaluation window, observed conversion lag, minimum evidence needed for a decision and zero-conversion stop-loss **before activation**. None is invented here. The $35/$55 thresholds are not CPC forecasts, bid caps, target-CPA settings or authority to spend. No competition, click cost, conversion rate or reduction outcome has been measured.

## First 20 ATE files

Maintain a fixed cohort of the first 20 paid, accepted Photo Radar ATE files by paid timestamp, with a stable tie-breaker. Use deployed operational reporting and confirm its cohort definition before interpreting the number; do not create a competing dashboard from assumptions.

For each file, retain the original payable fine and the final approved Crown outcome, using comparable surcharge treatment. A reduction is the original fine minus the final fine; a withdrawal reduces the original fine to zero. A completed file with no reduction contributes **$0**. The Fabsy fee and its GST are separate and must not be hidden inside the Crown-reduction number. Track whether the client approved the deal and whether the outcome is final.

Report `cohort files / completed / pending` together. Pending files are neither zero reductions nor invisible exclusions. An interim median among completed files must be labelled incomplete; the final first-20 median requires the fixed cohort to resolve. If that median is **under $40**, flag the consumer value proposition for review and separately examine fleet retention, account pricing and cost to serve. Do not claim fleet succeeds or quietly discard unsuccessful cases to improve the median.

The [legal-source notes](../../photo-radar/legal-sources.md) distinguish legitimate review questions from automatic-invalidity claims. Keep site exceptions, red-light/speed distinctions, disclosure gaps, service history and the unresolved Calgary five-minute policy question visible in case review. Ad reporting is not a place to export that case evidence.
