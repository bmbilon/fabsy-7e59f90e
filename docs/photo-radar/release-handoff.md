# Photo Radar release handoff — August 31, 2026

The Photo Radar source is implemented and frozen for the coordinated release. The `Launch multilingual campaigns` task owns the merge into current main, migration application and site/edge deployment. This task did not commit or deploy the shared checkout.

[Source manifest](source-handoff.json) lists 103 source, shared-file and test references with SHA256 hashes. The shared baseline is `03621fc2eb5c7ea4efb5183efb8fdee2aef031f7`. Shared files include earlier Rapid Resolution, multilingual and Pro/Referral work; they are merge references, **not whole-file replacements over newer main**. [Content handoff](content-snapshot-handoff.json) supplies the exact guard/test references. Rebuild snapshots in the merged release worktree rather than copying this checkout's old generated tree. Preserve the current live locale gates and the English-only Photo/Pro release scope.

## Included

- `/photo-radar`, `$79 + GST` intake, owner declaration, manual/OCR classification, offence-date handling, no insurance step or IIR, product-specific consent, authoritative checkout/webhook and verified paid receipts.
- Structured ATE disclosure review, actual complete-disclosure receipt time and 48-hour due time, evidence-based Crown asks, versioned offers/client instructions, saved final outcomes and the first-20 median including zero reductions.
- Staff draft/copy queue and saved-outcome email controls. Saving an outcome does not send a message. The optional final email requires staff preview and explicit confirmation; the endpoint independently verifies the paid saved outcome.
- Six shared-source Photo FAQs/schema, the three refreshed Alberta/Edmonton/Calgary guides, $79 guide calls to action, shared ladder/Terms 5C/priceRange, sitemap/llms registration, and `/fleet` with a real account-inquiry handoff.
- [Paused acquisition assets](../paid-acquisition/2026-08-31-photo-radar/README.md): one Search campaign, three groups, 78 exact/phrase keywords, three RSAs, 44 negatives and three Meta text variants. No import or spend.

## Billing and deployment

[Live Stripe record](stripe-provisioning.json): account `acct_1PG64qAt6NWmIwaS`, product `prod_VAmmGDIMzF4Njl`, exclusive one-time CAD79 price `price_1UARCWAt6NWmIwaSdmboYoZP`, exclusive Alberta 5% GST `txr_1UARPtAt6NWmIwaSKJip9xAE`. `STRIPE_PHOTO_RADAR_PRICE_ID` and `STRIPE_GST_TAX_RATE_ID` are set in `gcasbisxfrssonllpqrw`; stored digests match. No customer, Checkout Session, charge, refund or email was created. The release coordinator also requested PRO20 provisioning; its separate valid 20%-once coupon is verified and handed to the Pro owner. Photo checkout cannot use it.

[Live webhook subscription receipt](stripe-webhook-provisioning.json): the release coordinator requested five additional events on the existing active endpoint `we_1U02lSAt6NWmIwaSNP26qckC` (`fabsy-idr-payments-live`). Added `charge.refunded`, `charge.dispute.created`, `refund.created`, `refund.updated`, and `refund.failed`; the original four checkout events remain. All nine were verified after saving and reloading the Dashboard. Endpoint URL, API version `2024-04-10`, account scope, Snapshot payload, name and description were preserved. The signing secret was not revealed, rolled or changed; no events were resent and no financial transactions were created. This clears the subscription check, not the application or delivery checks.

Apply Photo migration `20260831115000_photo_radar_product.sql` after the multilingual prerequisite and before Pro `120000`, Referral `121000`, and saved-resolution email `122000`. Reconcile production migration history and existing data before applying. The disposable tests do not prove the production database is migrated.

Deploy the integrated versions of `submit-ticket`, `submit-assessment-intake`, `create-payment`, `create-idr-payment`, `create-assessment-payment`, `idr-payment-webhook`, `ocr-ticket`, `analyze-ticket-ai`, `generate-consent-form`, `get-checkout-session`, `send-contact-email`, `send-idr-case-update`, and `generate-json-ld`, with their shared modules. Pro's additional functions and source are listed in its separate manifest. Existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, site URL and Supabase configuration stay under their existing contracts; no values are recorded here.

Receipt tracking uses the actual service amount excluding GST and a stable Stripe transaction ID. The Google Ads owner verified the separate **Secondary** Website Purchase action `Fabsy paid Photo Radar` in account `938-501-7797`, conversion type ID `7740881425`. Use `VITE_GADS_ID=AW-18419256057` and `VITE_GADS_PHOTO_RADAR_PURCHASE_LABEL=TEo-CJH0kescEPmV_s5E`, giving `send_to=AW-18419256057/TEo-CJH0kescEPmV_s5E`. The release coordinator owns build configuration and deployment. Preserve the officer `VITE_GADS_PURCHASE_LABEL=MyAbCPiLj-scEPmV_s5E`; camera orders never fall back to it. Missing Photo Ads configuration suppresses that Ads event, while the verified GA4 purchase retains its correct product/value.

The saved Photo action uses dynamic CAD values, a zero fallback, Every counting, 90-day click / 3-day engaged-view / 1-day view windows, and data-driven attribution for Google paid channels. Enhanced Conversions is not configured. The account owner also verified advertiser identity `EXECOM INC.`, location `CA`; the earlier document-review estimate is superseded. Both purchase actions remain Secondary, with zero Primary actions and zero campaigns. Google reported `Awaiting conversions` and no tag found during setup: account provisioning is not proof of deployed tracking or event receipt. Production receipt, attribution, duplicate handling and a checkout with no browser return remain launch checks. See the [account setup evidence](../paid-acquisition/2026-08-30/google-ads-account-setup.md).

The release coordinator found the repository had no existing Ads ID or RR label secret and added the supplied Ads ID and Photo label to both CI build environments. The RR label secret remains absent at this handoff and was left untouched; its value above identifies the provider action, not deployed configuration. That gap was relayed to the Ads owner separately. No successful conversion delivery is claimed for either product.

## Verification

| Check | Result |
| --- | --- |
| TypeScript and focused changed-file lint | Pass; existing unrelated admin/footer warnings remain |
| Receipt/revenue/Ads product isolation | 4 tests pass |
| Ticket classification/date/cache handoffs | Pass with synthetic fixtures |
| Real intake component rendering | 7 tests pass, including camera no-IIR and officer compatibility |
| Guide answer panels | 5 tests pass, all three camera guides and officer route preservation |
| Photo payment/checklist, multilingual consent and contact safety | 30 Deno tests pass |
| Photo-only and combined 115000/120000/121000/122000 PostgreSQL tests | Pass in disposable local socket-only databases |
| Content/snapshot tests | 1,122 generated pages pass; 38 curated, zero quarantined; all five new public route guards and adversarial tests pass |
| Pro public copy/FAQ/schema parity and sitemap | Pass; 100 page URLs preserve all 77 existing blog entries |
| Direct production Vite build | Pass; existing large-chunk, Sass and Browserslist warnings |
| Browser UI | Photo mobile/desktop, manual ticket-type toggle, fleet form, free-check modal, three camera guides and shared pricing/terms reviewed; no live submissions |

The normal `npm run build` prebuild includes a remote content synchronization, so it was not used to overwrite unrelated shared source during development. The release owner runs the full pipeline on the merged source. `VALIDATE_ALL_PRERENDERED=1` cannot run completely in this checkout because its generated locale manifest is absent. Exact shared business-catalog/core compatibility diagnostics are documented in the content handoff; no full-tree pass or bypass is claimed.

## Before paid acquisition

1. Verify the merged deployment, real crawler snapshots, English-only route/order gates, and a test-mode signed checkout/webhook/replay with CAD79 + CAD3.95 GST. No test emails or real client records.
2. Connect the approved raw-disclosure and clone/notification workers, or operate the implemented staff review/copy/offer process. The queue is not proof that an external worker, plea or Crown communication ran.
3. Preserve the completed advertiser identity verification and distinct Secondary Photo action. Verify the deployed paid Photo conversion and ad-policy readiness, then use a concrete approved spend budget. Keep ads paused meanwhile. Scale below CAD35 CAC and cut at CAD55 only using mature paid-customer cohorts; contribution CAD72 is an assumption. Watch the fixed first 20 paid ATE files and flag a completed-cohort median reduction below CAD40.
4. Agree fleet account terms before monthly QuickBooks invoicing. The form sends an account inquiry through the existing contact endpoint; it does not create a QuickBooks customer, invoice or payment.
