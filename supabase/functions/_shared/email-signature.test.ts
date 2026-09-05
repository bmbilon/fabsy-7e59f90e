import assert from "node:assert/strict";
import {
  getFabsyEmailSignature,
  getFabsySMSSignature,
} from "./email-signature.ts";
import {
  renderTicketAdminEmailHtml,
  renderTicketClientEmailHtml,
  type TicketNotification,
} from "./ticket-notification-html.ts";

Deno.test("Fabsy email signature uses the current website brand", () => {
  const html = getFabsyEmailSignature();

  assert.match(html, /https:\/\/fabsy\.ca\/apple-touch-icon\.png\?v=4/);
  assert.match(html, />Fabsy<\/a>/);
  assert.match(html, /Traffic ticket agent services for Alberta drivers/);
  assert.match(html, /#3B82F6/);
  assert.match(html, /#0F172A/);
  assert.match(html, /#334155/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /Rapid Resolution<\/span> is \$198 CAD plus GST/);
  assert.match(html, /href="tel:\+18257932279"/);
  assert.match(html, /href="mailto:hello@fabsy\.ca"/);
  assert.match(html, /Confidentiality Notice:/);
  assert.match(html, /Service Disclaimer:/);

  for (
    const legacyBrand of [
      "linear-gradient",
      "display: flex",
      "-webkit-text-fill-color",
      "#E879F9",
      "#C084FC",
      "#A78BFA",
      "#86198F",
      "⚖️",
    ]
  ) {
    assert.ok(
      !html.includes(legacyBrand),
      `legacy email branding remains: ${legacyBrand}`,
    );
  }
});

Deno.test("ticket notification emails include the shared current-brand signature", () => {
  const ticket: TicketNotification = {
    preferredLocale: "en",
    submissionId: "synthetic-case",
    firstName: "Test",
    lastName: "Driver",
    email: "driver@example.test",
    phone: "+1 825 555 0100",
    ticketNumber: "T-100",
    violation: "Synthetic violation",
    fineAmount: "$100",
    submittedAt: "2026-09-03T00:00:00.000Z",
  };

  for (
    const html of [
      renderTicketAdminEmailHtml(ticket, "https://fabsy.ca"),
      renderTicketClientEmailHtml(ticket),
    ]
  ) {
    assert.match(html, /https:\/\/fabsy\.ca\/apple-touch-icon\.png\?v=4/);
    assert.match(
      html,
      /Traffic ticket agent services for Alberta drivers/,
    );
    assert.ok(!html.includes("#E879F9"));
    assert.ok(!html.includes("⚖️"));
  }
});

Deno.test("signature branding preserves SMS, price and service scope", () => {
  assert.equal(
    getFabsySMSSignature(),
    "\n\n---\nFabsy Traffic Ticket Services\n📞 (825) 793-2279 | hello@fabsy.ca\nfabsy.ca",
  );
  const text = getFabsyEmailSignature().replace(/<[^>]*>/g, "").replace(
    /\s+/g,
    " ",
  );
  assert.ok(
    text.includes(
      "Rapid Resolution is $198 CAD plus GST for eligible Alberta pre-trial matters. Trial and government fines are separate.",
    ),
  );
  assert.ok(
    text.includes(
      "Fabsy is an agent service for Alberta traffic matters, not a law firm. This communication is general information and does not constitute legal advice or create a solicitor-client relationship.",
    ),
  );
});
