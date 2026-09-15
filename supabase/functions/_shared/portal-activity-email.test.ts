// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type PortalActivityEvent,
  portalActivitySubject,
  renderPortalActivityHtml,
} from "./portal-activity-email.ts";

const event: PortalActivityEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  event_type: "representation_consent_signed",
  entity_type: "ticket_submission",
  entity_id: "00000000-0000-4000-8000-000000000002",
  occurred_at: "2026-09-15T18:00:00.000Z",
  payload: {
    client_name: "Coady <Barnes>",
    client_email: "coady@example.ca",
    ticket_number: "AB-123",
    submission_id: "00000000-0000-4000-8000-000000000002",
    client_date_of_birth: "1994-06-03",
    disclosure_lookup_type: "drivers_licence",
    disclosure_lookup_value: "123456789",
  },
};

Deno.test("portal activity email identifies the person and escapes private fields", () => {
  assertEquals(
    portalActivitySubject(event),
    "[Fabsy Portal] Representation consent signed — Coady <Barnes>",
  );
  const html = renderPortalActivityHtml(event, "https://fabsy.ca");
  assertStringIncludes(html, "Coady &lt;Barnes&gt;");
  assertStringIncludes(
    html,
    "/admin/submissions/00000000-0000-4000-8000-000000000002",
  );
  assertStringIncludes(html, "signed consent PDF is attached");
  assertStringIncludes(html, "drivers licence");
  assertStringIncludes(html, "123456789");
  assertStringIncludes(html, "1994-06-03");
});
