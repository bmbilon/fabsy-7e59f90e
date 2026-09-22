import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildManualRepresentationLinks,
  parseCheckoutConsent, checkoutConsentMatches, CHECKOUT_CONSENT_VERSION,
  parseManualRepresentationCreate,
  publicManualRepresentationRecord,
} from "./manual-representation.ts";

Deno.test("manual representation links keep the bearer token out of storage fields", () => {
  const links = buildManualRepresentationLinks(
    "https://fabsy.ca/",
    "20000000-0000-4000-8000-000000000013",
    "secret-token",
  );
  assertEquals(links, {
    checkoutUrl: "https://fabsy.ca/representation-payment#case=20000000-0000-4000-8000-000000000013&token=secret-token",
    consentUrl: "https://fabsy.ca/representation-payment#case=20000000-0000-4000-8000-000000000013&token=secret-token",
    paymentUrl: "https://fabsy.ca/representation-payment#case=20000000-0000-4000-8000-000000000013&token=secret-token",
  });
});

Deno.test("staff create input is normalized and selects immutable officer pricing", () => {
  assertEquals(parseManualRepresentationCreate({
    firstName: " Ada ", lastName: " Lovelace ", email: "ADA@EXAMPLE.COM ",
    ticketNumber: " AB-123 ", ticketType: "officer_issued",
  }), {
    firstName: "Ada", lastName: "Lovelace", email: "ada@example.com",
    ticketNumber: "AB-123", ticketType: "officer_issued", violation: "See ticket supplied by email",
    violationDate: null, registeredOwnerOnOffenceDate: null,
  });
});

Deno.test("photo radar link creation requires current ownership confirmation", () => {
  assertThrows(() => parseManualRepresentationCreate({
    firstName: "Ada", lastName: "Lovelace", email: "ada@example.com",
    ticketNumber: "AB-123", ticketType: "photo_radar",
  }), Error, "registered owner");
});

Deno.test("public record contains only the fields needed by the two client pages", () => {
  assertEquals(publicManualRepresentationRecord({
    id: "20000000-0000-4000-8000-000000000013",
    client_id: "20000000-0000-4000-8000-000000000014",
    first_name: "Ada", last_name: "Lovelace", email: "ada@example.com",
    ticket_number: "AB-123", violation: "Speeding", violation_date: "2026-09-01",
    ticket_type: "officer_issued", registered_owner_on_offence_date: null,
    consent_form_path: null, status: "awaiting_payment",
  }, "not_started"), {
    submissionId: "20000000-0000-4000-8000-000000000013",
    clientId: "20000000-0000-4000-8000-000000000014",
    firstName: "Ada", lastName: "Lovelace", email: "ada@example.com",
    ticketNumber: "AB-123", violation: "Speeding", violationDate: "2026-09-01",
    ticketType: "officer_issued", registeredOwnerOnOffenceDate: null,
    consentSigned: false, consentAccepted: false, pleadNotGuilty: null, paymentState: "not_started", priceCad: 198,
    priceLabel: "$198 CAD plus applicable GST",
  });
});

Deno.test("organization consent preserves the named owner and representative confirmation", () => {
  const row = { id: "20000000-0000-4000-8000-000000000013", first_name: "DOME", last_name: "PRODUCTIONS INC", ticket_number: "TEST-OWNER", ticket_type: "photo_radar" as const };
  const consent = parseCheckoutConsent({ accepted: true, method: "checkbox", version: CHECKOUT_CONSENT_VERSION, pleadNotGuilty: false }, row);
  assertEquals(consent.name, "DOME PRODUCTIONS INC");
  assertEquals(consent.confirmation.includes("authorized representative of the organization"), true);
  assertEquals(checkoutConsentMatches({ ...row, intake_consent: consent }), true);
  assertEquals(checkoutConsentMatches({ ...row, intake_consent: { ...consent, confirmation: "changed" } }), false);
});
