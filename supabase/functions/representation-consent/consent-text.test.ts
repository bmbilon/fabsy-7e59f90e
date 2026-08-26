import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsentText,
  CONSENT_TEXT_VERSION,
  type ConsentTextInvite,
} from "./consent-text.ts";

const invite: ConsentTextInvite & Record<string, unknown> = {
  client_legal_name: "Test Person",
  client_first_name: "Test",
  client_last_name: "Person",
  client_email: "should-not-appear@example.invalid",
  client_drivers_license: "SHOULD-NOT-APPEAR",
  ticket_number: "TEST-1",
  ticket_numbers: ["TEST-1", "TEST-2"],
  charge_description: "Fail to stop",
  offence_date_text: "August 1, 2026",
  court_location: "Red Deer",
  court_date_text: "September 22, 2026",
  matter_details: "Right turn on red",
  base_fee_cents: 48800,
  fee_currency: "CAD",
  tax_terms: "plus GST",
  success_fee_percent: 30,
  success_fee_waived: true,
  additional_fee_terms: "This commercial text must never appear.",
  additional_authorization_terms:
    "Pay an extra $99 purchase fee before representation begins.",
  representative_first_name: "Brett",
  representative_last_name: "Bilon",
  representative_firm: "Fabsy Traffic Ticket Services",
  representative_phone: "(825) 793-2279",
  representative_mailing_address: null,
  representative_city: null,
  representative_province: "AB",
  representative_postal_code: null,
  government_form_code: "APTO13348",
  government_form_revision: "2023-08",
  government_form_url: "https://cfr.forms.gov.ab.ca/Form/APTO13348.pdf",
};

test("consent-only text excludes commercial and non-APTO identity fields", () => {
  const text = buildConsentText(invite);
  assert.doesNotMatch(text, /\b(?:fee|fees|purchase|payment|checkout|gst)\b/i);
  assert.doesNotMatch(text, /\$488|\$99|30%|commercial text/i);
  assert.doesNotMatch(text, /should-not-appear|driver'?s licence/i);
  assert.match(text, /Test Person/);
  assert.match(text, /TEST-1, TEST-2/);
  assert.match(text, /Brett Bilon/);
});

test("consent-only text preserves authority and signature boundaries", () => {
  const text = buildConsentText(invite);
  assert.match(text, /Traffic Ticket Digital Service/);
  assert.match(text, /request, receive, and review full disclosure/);
  assert.match(text, /does not promise or guarantee a particular result/);
  assert.match(text, /does not extend a response/);
  assert.match(text, /PERSONAL INFORMATION CONSENT/);
  assert.match(
    text,
    /does not complete or replace that prescribed form/,
  );
  assert.match(text, /intend it as my electronic signature/);
  assert.match(CONSENT_TEXT_VERSION, /v3-consent-only/);
});
