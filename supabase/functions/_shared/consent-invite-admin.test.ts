import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  buildConsentInviteDelivery,
  parseConsentInviteCreate,
  parseConsentInviteList,
  parseConsentInviteReissue,
  publicConsentInviteMetadata,
} from "./consent-invite-admin.ts";

const invite = {
  id: "20000000-0000-4000-8000-000000000013",
  status: "pending",
  expires_at: "2026-09-22T18:00:00.000Z",
  client_legal_name: "Coady Barnes",
  client_email: "coady@example.test",
  ticket_number: "A17018142J",
  ticket_numbers: ["A17018142J"],
  charge_description: "Speeding",
  created_at: "2026-09-15T18:00:00.000Z",
  reissued_from_invite_id: null,
};

Deno.test("consent invite create input is normalized", () => {
  assertEquals(
    parseConsentInviteCreate({
      firstName: " Coady ",
      lastName: " Barnes ",
      email: "COADY@EXAMPLE.TEST",
      ticketNumber: "a17018142j",
      chargeDescription: " Speeding ",
    }),
    {
      firstName: "Coady",
      lastName: "Barnes",
      email: "coady@example.test",
      ticketNumber: "A17018142J",
      chargeDescription: "Speeding",
      offenceDateText: null,
      courtLocation: null,
      courtDateText: null,
      matterDetails: null,
      expiresInDays: 7,
    },
  );
});

Deno.test("consent invite input rejects invalid bounds", () => {
  assertThrows(() =>
    parseConsentInviteCreate({
      firstName: "Coady",
      lastName: "Barnes",
      email: "not-an-email",
      ticketNumber: "A1",
      chargeDescription: "Speeding",
    })
  );
  assertThrows(() => parseConsentInviteList({ limit: 101 }));
  assertThrows(() =>
    parseConsentInviteReissue({
      inviteId: "not-a-uuid",
    })
  );
});

Deno.test("delivery uses a fragment token and public list omits secrets", () => {
  const delivery = buildConsentInviteDelivery(
    "https://fabsy.ca",
    "private_bearer_token_abcdefghijklmnopqrstuvwxyz",
    invite,
  );
  assertEquals(
    delivery.consentUrl,
    "https://fabsy.ca/representation-consent#token=private_bearer_token_abcdefghijklmnopqrstuvwxyz",
  );
  assertEquals(delivery.consentUrl.includes("?"), false);
  assertEquals(publicConsentInviteMetadata(invite), {
    inviteId: invite.id,
    status: "pending",
    clientName: "Coady Barnes",
    clientEmail: "coady@example.test",
    ticketNumber: "A17018142J",
    ticketNumbers: ["A17018142J"],
    chargeDescription: "Speeding",
    expiresAt: "2026-09-22T18:00:00.000Z",
    createdAt: "2026-09-15T18:00:00.000Z",
    reissuedFromInviteId: null,
  });
  assertEquals("token" in publicConsentInviteMetadata(invite), false);
  assertEquals("token_hash" in publicConsentInviteMetadata(invite), false);
});
