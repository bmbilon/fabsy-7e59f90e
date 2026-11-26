import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { checkoutReminderEventId, mintCheckoutReminderResumeUrl } from "../_shared/checkout-reminder-link.ts";
import { reminderCopy, reminderEmail, reminderStopToken } from "../_shared/ticket-checkout-reminder.ts";
import { resumeCheckout } from "./index.ts";

const id = "a1111111-1111-4111-8111-111111111111";
const caseId = "b2222222-2222-4222-8222-222222222222";
const clientId = "c3333333-3333-4333-8333-333333333333";
const secret = "fixture-secret-for-reminder-authorization";
const now = Date.now();
const ticketNumber = "E12345678A";
const hash = "a".repeat(64);
const context = {
  valid: true, review_reason: null, paid: false, consented: true, email: "fabsy-qa@example.invalid",
  phone: "", sms_opt_in: false, preferred_locale: "en", ticket_number: ticketNumber,
  document_path: caseId + "/ticket.jpg",
};
const assert = (condition: unknown, description: string) => {
  if (!condition) throw new Error(description);
};

async function fixture({ lookup = true, email = context.email, paid = false, camera = false,
  sentAt = now - 5_000, includeLink = true } = {}) {
  const link = await mintCheckoutReminderResumeUrl(id, secret);
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("reminder")!;
  const ticket = {
    id: caseId, client_id: clientId, email: context.email, first_name: "Fabsy", last_name: "Fixture",
    ticket_number: ticketNumber, ticket_type: camera ? "photo_radar" : "officer_issued",
    intake_mode: "photo_only", intake_review_status: "ready", registered_owner_on_offence_date: null,
    ticket_document_path: context.document_path, representation_access_token_hash: hash,
    intake_consent: { accepted: true }, consent_form_path: caseId + "/consent-form-" + hash.slice(0, 16) + ".pdf",
  };
  const rows: Record<string, unknown> = {
    ticket_checkout_reminder_events: {
      status: "sent", sent_at: new Date(sentAt).toISOString(), channel: "email", recipient: context.email,
      source_context: context, payload: { text: includeLink ? "Complete saved checkout\n" + link : "https://fabsy.ca/payment" },
      campaign: { source_id: caseId, source_kind: "submission", ticket_number: ticketNumber, status: "exhausted" },
    },
    ticket_submissions: ticket,
    case_portal_verifications: null,
    idr_checkout_intents: null,
  };
  const db = {
    rpc(name: string) {
      assert(["ticket_checkout_reminder_context", "case_has_portal_lookup"].includes(name), "Unexpected database operation");
      return Promise.resolve({ data: name === "case_has_portal_lookup" ? lookup : { ...context, email, paid }, error: null });
    },
    from(table: string) {
      assert(Object.hasOwn(rows, table), "Unexpected database read");
      const query = { select: () => query, eq: () => query, is: () => query, in: () => query,
        order: () => query, limit: () => query, maybeSingle: () => Promise.resolve({ data: rows[table], error: null }) };
      return query;
    },
  } as unknown as SupabaseClient;
  return { link, token, db };
}

Deno.test("reminders use a case-bound link in place of the empty payment form", async () => {
  const { link, token } = await fixture();
  assert(reminderCopy(context, 2, link).link === link, "Saved link was not used");
  const oneTime = reminderEmail(context, 0, "https://fabsy.ca/stop-test", link);
  assert(oneTime.subject === `Ticket ${ticketNumber} — Continue your saved checkout`, "One-time reminder must identify the ticket");
  assert(oneTime.text?.split(/\s+/).includes(link), "One-time reminder must carry the saved checkout link");
  assert(oneTime.to.length === 1 && oneTime.to[0] === context.email, "One-time reminder must use the exact recipient");
  assert(await checkoutReminderEventId(token, secret) === id, "Link did not verify");
  const stop = await reminderStopToken(id, secret);
  assert(await checkoutReminderEventId(stop, secret) === null, "Unsubscribe token must not authorize checkout");
});

Deno.test("case with a saved lookup opens its existing payment step and invokes normal Stripe checkout", async () => {
  const { token, db } = await fixture();
  const read = await resumeCheckout(db, { token, action: "read" }, secret, secret, now);
  assert((await read.json()).step === "payment", "A saved lookup should go straight to payment");
  const response = await resumeCheckout(db, { token, action: "pay" }, secret, secret, now, async request => {
    const payment = request as { submissionId: string; clientId: string; accessToken: string; formData: { ticketNumber: string } };
    assert(payment.submissionId === caseId && payment.clientId === clientId, "Wrong case sent to checkout");
    assert(payment.formData.ticketNumber === ticketNumber && payment.accessToken.startsWith("c1."), "Invalid saved checkout");
    return Response.json({ url: "https://checkout.stripe.com/c/pay/qa-fixture" });
  });
  assert((await response.json()).url === "https://checkout.stripe.com/c/pay/qa-fixture", "Stripe redirect was lost");
});

Deno.test("show the latest stage and deny payment until lookup and ownership are confirmed", async () => {
  for (const [options, step] of [[{ lookup: false }, "lookup"], [{ camera: true }, "owner"], [{ paid: true }, "complete"]] as const) {
    const { db, token } = await fixture(options);
    const response = await resumeCheckout(db, { token, action: "read" }, secret, secret, now);
    assert((await response.json()).step === step, "Wrong next step for saved ticket");
    const pay = await resumeCheckout(db, { token, action: "pay" }, secret, secret, now, () => {
      throw new Error("Ineligible payment request must never reach Stripe");
    });
    assert(step === "complete" ? (await pay.json()).step === "complete" : pay.status >= 400, "Unexpected payment result");
  }
});

Deno.test("an expired link, changed recipient or unfrozen link cannot access the case", async () => {
  for (const options of [{ sentAt: now - 8 * 864e5 }, { email: "new@example.invalid" }, { includeLink: false }]) {
    const { db, token } = await fixture(options);
    const response = await resumeCheckout(db, { token, action: "read" }, secret, secret, now);
    assert(response.status === 404, "Checkout must not disclose saved details");
  }
});
