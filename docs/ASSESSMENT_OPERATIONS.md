# Ticket Triage Operations

Last reviewed: 2026-08-22

Owner: Fabsy operations

Applies to: the $149 CAD Traffic Ticket + Insurance Impact Assessment (internal name: Ticket Triage)

## Non-negotiable product rules

- Ticket Triage is a human-reviewed assessment, not automated legal advice, a binding insurance quote, or a promise of a court, insurer, premium, fine, or demerit result.
- The customer pays $149 CAD total, including applicable GST.
- If representation is worthwhile and the same matter is eligible, the $149 payment can be applied to Fabsy's $488 base representation fee. Quote a $339 base-fee balance plus applicable tax. The 30% success fee still applies to any fine reduction; there is no success fee if the fine is not reduced.
- Eligible Ticket Triage customers receive priority placement in the representation queue. Priority does not extend a ticket deadline, guarantee acceptance, or promise a start date or outcome.
- Do not deliver an assessment until the payment is verified, the ticket is readable enough to identify the matter, and every required result field has been reviewed by a person.
- Delivered assessments are immutable. Correct a material error through the documented customer-support/escalation process; never silently alter a delivered record.

## Reviewer source hierarchy

Use the most authoritative current source available, in this order:

1. The customer's ticket or notice, including its offence wording, section, jurisdiction, dates, and instructions.
2. Current Alberta legislation, regulations, Alberta Court of Justice instructions, and Government of Alberta guidance.
3. Current Automobile Insurance Rate Board (AIRB) consumer and regulatory material.
4. Insurer-specific public underwriting/rating information, clearly identified as insurer-specific.
5. A documented internal precedent, only when the underlying source is still current.

For every external fact that affects the recommendation, record the source URL, title, access date, and the fact supported. Never use an unsourced search snippet, marketing article, old blog post, or AI output as the authority.

## Review workflow

### 1. Intake and privacy check

- Confirm the order is `ticket_insurance_assessment`, payment is recorded, the uploaded object is in the private `assessment-tickets` bucket, and the case is not already delivered.
- Confirm the ticket belongs to Alberta. If the document is unreadable, incomplete, or appears to be a different document, stop and request a replacement.
- Do not copy licence numbers, addresses, birth dates, or unrelated personal information into the result. Include only facts necessary to explain the assessment.
- Compare the ticket to the customer's typed answers. List any material mismatch under uncertainty instead of choosing one version without explanation.

### 2. Charge and deadline

- Transcribe the charge wording and statutory/regulatory section exactly as shown. Do not infer a section from a generic offence label when the ticket supplies one.
- Identify whether the document is an Offence Notice, Summons, Notice of Administrative Penalty, owner/camera notice, or another process. Different documents have different response paths.
- Use the response, appearance, court, review, or payment date printed on the document. Do not substitute a generic number of days.
- State the date in full and state what the ticket says must be done. If the date is unreadable or internally inconsistent, label the deadline uncertain and tell the customer to contact Fabsy immediately.
- Never imply that buying Ticket Triage, emailing Fabsy, or entering the representation queue pauses or satisfies the deadline.

Official baseline: the Alberta Court of Justice says the ticket itself specifies how and when a response must be made, and Alberta's Traffic Tickets Digital Service supports payment, time-to-pay requests, a not-guilty plea, trial-date requests, and prosecutor review. Payment of a ticket is a conviction date for demerit purposes. See the current sources at the end of this SOP.

### 3. Fine and demerits

- Record the displayed fine and any surcharge separately when the document provides both. Do not invent a fine from a schedule if the document is clear.
- Verify demerit points against current Alberta legislation or Government of Alberta material using the exact offence/section.
- Distinguish conviction consequences from ticket issuance. Alberta assigns demerits on conviction, not on the ticket date.
- Treat demerit duration and conviction visibility as different concepts. Alberta says demerit points remain on the driving record and abstract for two years from the conviction date; a Standard Driver's Abstract can be requested for 3, 5, or 10 years and includes conviction information.
- Calculate proximity to suspension only when the customer's licence class/status and current points are known. For fully licensed drivers, Alberta's published suspension threshold is 15 points within two years; for GDL drivers it is 8. If the licence status or point balance is unknown, describe the threshold but do not claim the customer's resulting total.

### 4. Prior-conviction context

The intake label `Relevant prior convictions` is screening data, not a complete abstract and not a universal insurer lookback period.

- Review every conviction the customer supplies.
- Separately flag minor/major convictions within the previous three years and Criminal Code convictions within the previous four years because AIRB's 2026 Good Driver Protection definition uses those periods.
- Keep demerits on their separate two-year clock.
- If the count, category, or dates are unknown, do not assume a clean record. Set the insurance result to `uncertain` when that missing fact could change the classification.
- Recommend a current Standard Driver's Abstract when an accurate conviction timeline or point total is necessary. Alberta offers 3-, 5-, and 10-year abstracts.

### 5. Insurance and renewal context

- Start from the customer's current insurer, renewal month, approximate premium, driving use, and record. Note missing inputs.
- Confirm whether the alleged conviction is commonly categorized as minor, major, or Criminal Code using current authoritative material. Do not equate the number of demerit points with insurer severity.
- AIRB states that convictions can affect premiums, discounts, coverage eligibility, and rating, but insurers rate convictions differently. State this variability in every assessment.
- A new conviction may remove Good Driver rate-cap eligibility, but the 2026 qualification rules and their implementation timing can change. Verify the current AIRB rule on the review date before relying on it.
- Do not state that an insurer will see the ticket before conviction, will apply a specific surcharge, or will hold a surcharge for a fixed period unless a current source supports that exact claim.
- Never call an AIRB average a customer quote. If using a published average or scenario, label it as an illustrative benchmark, cite it, and show the customer's actual premium separately.

### 6. Insurance-risk classification

Use the exact result values below. The classification describes practical risk from the supplied facts; it is not a probability or insurer decision.

| Value | Use when | Required wording discipline |
|---|---|---|
| `trivial` | The identified matter is not attached to the driver's record, or current authoritative material supports no meaningful personal insurance-rating consequence and no contrary customer context is present. | Explain the precise reason. Do not use `trivial` merely because the fine is small. |
| `moderate` | A conviction could affect rating, discounts, or renewal, but the record, offence category, timing, or likely dollars do not support calling the exposure material. | Describe the plausible pathway and the missing/limiting facts. |
| `material` | The matter creates a supported risk of a consequential rating/coverage effect, Good Driver ineligibility, suspension exposure, commercial-driving impact, or multi-year cost that can reasonably change the representation decision. | Identify the supported trigger; do not promise the effect or amount. |
| `uncertain` | A readable charge, licence status, conviction history, insurer/renewal context, or current source is missing and the answer could materially change. | Name the exact information needed and give the customer a concrete next step. |

Escalate for a second reviewer before delivery when the matter involves a mandatory court appearance, administrative penalty, suspension risk, Criminal Code allegation, commercial licence/employment dependency, an unfamiliar statutory section, conflicting sources, or a recommendation that depends on an unusually large financial estimate.

### 7. Financial exposure and break-even

- Annualize only a customer-supplied premium: monthly premium x 12. Label the result an approximation.
- Build low/base/high scenarios only when supported by a current cited benchmark or insurer-specific public rule. Show every input and never hide compounding or assume a universal three-year surcharge.
- Calculate the decision threshold from incremental future cost. The already-paid $149 assessment is credited on an eligible upgrade, leaving a $339 base-fee balance plus applicable tax. Include the separate 30% success fee only in scenarios where a fine reduction occurs.
- Compare representation cost against avoidable downside, not against the ticket fine alone. Consider premium exposure, loss of discounts/coverage, demerit/suspension or employment consequences, the fine, evidence strength, and the customer's tolerance for uncertainty.
- If reliable dollars are not reasonably supportable, say so. A qualitative recommendation with explicit uncertainty is better than false precision.

### 8. Recommendation

Choose one clear recommendation:

- `Representation appears worthwhile`: the supported downside and/or case circumstances justify considering the eligible $339 base-fee balance plus applicable tax and possible 30% success fee.
- `Representation does not appear economical`: the supported downside is unlikely to justify the additional spend, while preserving the customer's right to choose otherwise.
- `More information is required`: identify exactly what is missing and what the customer should obtain.
- `Fabsy representation may not be eligible`: explain the scope issue and the appropriate external next step without implying acceptance.

The `next step` must name one action and a date or urgency where applicable. If representation is recommended, repeat the $149 credit, $339 base-fee balance plus applicable tax, priority placement, eligibility condition, and separate 30% success-fee rule exactly.

### 9. Delivery QA

Before selecting `Send assessment`:

- [ ] Charge wording/section and document type match the uploaded ticket.
- [ ] Deadline is transcribed from the ticket or expressly marked uncertain.
- [ ] Fine, demerits, conviction timing, and licence thresholds are sourced and current.
- [ ] Insurance classification follows the rubric and does not promise a premium result.
- [ ] Every dollar scenario shows its assumptions and source.
- [ ] Representation economics use the $149 credit and $339 base-fee balance plus applicable tax; the 30% success-fee condition is accurate.
- [ ] Recommendation and next step agree with the analysis.
- [ ] Required escalation/second review is complete.
- [ ] No unnecessary personal information appears in the result.
- [ ] Every structured result field is complete and the preview is readable.

After sending, record the delivery timestamp and do not edit the delivered result.

## Controlled live-purchase QA

Run one controlled production purchase after a material release to the payment, webhook, storage, queue, email, or analytics path. Use a clearly synthetic ticket marked `FABSY INTERNAL QA - NOT A REAL TICKET`; never upload customer data for this test.

### Preconditions

- Record production release SHA, tester, date/time, target URL, and expected total ($149 CAD, GST included).
- Obtain action-time approval for the real charge, the exact customer email/phone entered, and the immediate full refund.
- Use a payment method authorized by the tester. Never record the card number, CVC, bank details, or Stripe secret in this document.
- Confirm the synthetic order will not be reviewed or delivered as a customer assessment.

### Evidence checklist

| Stage | Pass condition | Evidence to record |
|---|---|---|
| Intake | One assessment submission is created and the synthetic PDF is stored in the private bucket. | Submission ID, object path, created timestamp. |
| Checkout | Stripe Checkout identifies the assessment and shows one $149 CAD total, GST included. | Checkout session ID and screenshot/receipt reference; never card data. |
| Payment | Stripe shows one successful live payment for exactly $149 CAD. | Payment Intent ID, amount, currency, paid timestamp. |
| Webhook | The signed webhook consumes the reserved intent once and activates the assessment once. | Intent status `paid`; one session ID; one payment intent ID. |
| Queue | The submission is `assessment_pending`, paid, credit-eligible, not delivered, and visible in the staff assessment queue. | Queue observation and DB fields. |
| Email | The payment confirmation is sent once to the approved test email. | Received timestamp and `assessment_confirmation_sent_at`; do not store message content containing PII. |
| Confirmation page | The receipt page says the assessment is in the queue and shows the upgrade benefits. | URL/session reference and screenshot. |
| Analytics | One `assessment_purchase` event exists for the Stripe session; reload does not create a second event in the same session. | Transaction ID and observed event count. |
| Refund | Stripe shows a full $149 CAD refund, with no second charge. | Refund ID/status, amount, timestamp. |
| Close-out | The synthetic record is labelled internal QA and excluded from customer fulfilment and commercial KPIs. | Internal note or case ID and owner. |

### Database verification

Run read-only queries in the authenticated Supabase SQL editor. Replace the placeholder with the recorded UUID.

```sql
select
  id,
  service_type,
  status,
  assessment_price_cad,
  assessment_paid_at,
  assessment_checkout_session_id,
  assessment_payment_intent_id,
  assessment_confirmation_claimed_at,
  assessment_confirmation_sent_at,
  assessment_delivered_at,
  assessment_ticket_path,
  representation_credit_eligible
from public.ticket_submissions
where id = '<submission-uuid>';

select
  id,
  type,
  checkout_kind,
  expected_amount_cents,
  purchaser_email,
  stripe_checkout_session_id,
  status,
  attempts,
  created_at,
  updated_at
from public.idr_checkout_intents
where ticket_submission_id = '<submission-uuid>'
  and type = 'assessment';
```

Expected submission values: `ticket_insurance_assessment`, `assessment_pending`, `149.00`, non-null paid/session/payment-intent/confirmation-sent/object-path fields, null delivered timestamp, and `representation_credit_eligible = true`. Expected intent values: `assessment`, `ticket_assessment`, `14900`, `paid`, and one linked Stripe session.

### Refund and incident rules

- Refund the full $149 immediately after all pre-refund evidence is captured. Verify the final Stripe state and refund amount.
- A refund does not by itself erase the payment audit trail or undo a queued assessment. Clearly label the record internal QA and prevent fulfilment; do not delete payment or webhook evidence.
- Stop the test and do not retry blindly if the charge amount/currency is wrong, more than one charge appears, the confirmation page cannot verify the session, the webhook does not activate the case, the email duplicates, or the analytics purchase event duplicates.
- If the checkout fails before payment, confirm in Stripe that no charge exists before attempting one controlled retry.
- Treat any real customer document, unintended email recipient, exposed public object, duplicate charge, or incorrect refund as an incident and preserve the minimum evidence needed to investigate.

## Current authoritative sources

Verify these pages again when a review depends on them. Accessed 2026-08-22.

- [Alberta Court of Justice - Traffic Court](https://albertacourts.ca/cj/areas-of-law/traffic): ticket-specific response instructions and Traffic Tickets Service.
- [Government of Alberta - Fine payment](https://www.alberta.ca/fine-payment): current response/payment paths and due-date consequences.
- [Government of Alberta - Demerit driving suspension](https://www.alberta.ca/demerit-driving-suspension): conviction timing, two-year demerit duration, and GDL/non-GDL thresholds.
- [Government of Alberta - Get a driver's abstract](https://www.alberta.ca/get-drivers-abstract): 3-, 5-, and 10-year Standard Driver's Abstract contents.
- [AIRB - How auto insurance rates are calculated](https://www.airbfordrivers.ca/how-rates-are-calculated/): rating factors and conviction variability.
- [AIRB - Good Driver Protection](https://www.airbfordrivers.ca/good-driver-protection/): current Good Driver definition and exceptions.
- [AIRB - Alberta's Grid Rating System](https://www.airbfordrivers.ca/albertas-insurance-system/grid-rating-system/): grid rules and conviction-related surcharges.
