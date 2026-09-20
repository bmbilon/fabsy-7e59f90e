import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, preparePortalConsentEmail } from "./index.ts";
import {
  type PortalActivityEvent,
  portalActivitySubject,
} from "../_shared/portal-activity-email.ts";

const submissionId = "00000000-0000-4000-8000-000000000001";
const inviteId = "00000000-0000-4000-8000-000000000002";
const claimId = "00000000-0000-4000-8000-000000000003";
const pdf = new TextEncoder().encode(
  "%PDF-1.7\nSynthetic consent fixture\n%%EOF",
);
const digest = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const ticket = {
  id: submissionId,
  first_name: "Current",
  last_name: "Person",
  email: "current@example.test",
  ticket_number: "E12345678T",
  consent_form_path: `${submissionId}/consent.pdf`,
  service_type: "representation",
  deleted_at: null,
  intake_mode: "photo_only",
  intake_review_status: "ready",
};
const event: PortalActivityEvent = {
  id: "00000000-0000-4000-8000-000000000004",
  event_type: "representation_consent_signed",
  entity_type: "ticket_submission",
  entity_id: submissionId,
  occurred_at: "2026-09-20T18:00:00Z",
  payload: {
    submission_id: submissionId,
    consent_form_path: ticket.consent_form_path,
    ticket_number: "",
    client_name: "Stale",
    client_email: "stale@example.test",
  },
};

function database(
  record: Record<string, unknown>,
  expectedTable = "ticket_submissions",
  contents = pdf,
) {
  const downloads: string[] = [];
  const db = {
    from(table: string) {
      assertEquals(table, expectedTable);
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          assertEquals(column, "id");
          assertEquals(value, record.id);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: record, error: null });
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          download(path: string) {
            downloads.push(`${bucket}/${path}`);
            return Promise.resolve({ data: new Blob([contents]), error: null });
          },
        };
      },
    },
  } as unknown as Parameters<typeof preparePortalConsentEmail>[0];
  return { db, downloads };
}

Deno.test("staff consent resolves late ticket and client fields from current submission", async () => {
  const { db, downloads } = database(ticket);
  const prepared = await preparePortalConsentEmail(db, event);
  assertEquals(
    portalActivitySubject(prepared.event),
    "Ticket E12345678T — Representation consent received",
  );
  assertEquals(prepared.event.payload.client_name, "Current Person");
  assertEquals(prepared.event.payload.client_email, "current@example.test");
  assertEquals(downloads, [`consent-forms/${ticket.consent_form_path}`]);
  assertEquals(prepared.attachments.length, 1);
  const reviewed = await preparePortalConsentEmail(
    database({ ...ticket, intake_review_status: "needs_review" }).db,
    event,
  );
  assertEquals(reviewed.attachments.length, 1);
});

Deno.test("unclear ticket, review, ownership, or non-PDF content blocks staff consent", async () => {
  for (
    const patch of [
      { ticket_number: "" },
      { ticket_number: "UNKNOWN" },
      { intake_review_status: "pending_scan" },
      { intake_review_status: "scanning" },
      { deleted_at: "2026-09-20" },
      { consent_form_path: `${inviteId}/consent.pdf` },
      { consent_form_path: `${submissionId}/../consent.pdf` },
    ]
  ) {
    const { db, downloads } = database({ ...ticket, ...patch });
    await assertRejects(() => preparePortalConsentEmail(db, event));
    assertEquals(downloads.length, 0);
  }
  await assertRejects(
    () =>
      preparePortalConsentEmail(
        database(
          ticket,
          "ticket_submissions",
          new TextEncoder().encode("not a PDF"),
        ).db,
        event,
      ),
    Error,
    "consent_attachment_invalid",
  );
});

async function manualFixture() {
  const hash = await digest(pdf);
  const invite = {
    id: inviteId,
    status: "completed",
    access_revoked_at: null,
    ticket_submission_id: submissionId,
    client_legal_name: "Current Signer",
    client_email: "signer@example.test",
    ticket_number: "E12345678T",
    ticket_numbers: ["E12345678T", "E87654321A"],
    signature_method: "manual_scan",
    pdf_path: `standalone/${inviteId}/${claimId}/signed-consent.pdf`,
    pdf_sha256: hash,
    manual_scan_pdf_path: `manual/${inviteId}/${claimId}/signed-scan.pdf`,
    manual_scan_pdf_sha256: hash,
  };
  const inviteEvent = {
    ...event,
    entity_type: "representation_consent_invite",
    entity_id: inviteId,
    payload: { legacy_invite_id: inviteId, consent_form_path: invite.pdf_path },
  };
  return { invite, inviteEvent };
}

Deno.test("manual consent attaches verified signed scan and audit PDF for the same invite/claim", async () => {
  const { invite, inviteEvent } = await manualFixture();
  const { db, downloads } = database(invite, "representation_consent_invites");
  const prepared = await preparePortalConsentEmail(db, inviteEvent);
  assertEquals(prepared.attachments.length, 2);
  assertStringIncludes(
    prepared.attachments[0].filename,
    "signed-consent-E12345678T",
  );
  assertStringIncludes(
    prepared.attachments[1].filename,
    "consent-audit-E12345678T",
  );
  assertEquals(downloads, [
    `consent-forms/${invite.pdf_path}`,
    `representation-consent-scans/${invite.manual_scan_pdf_path}`,
  ]);
  assertEquals(
    portalActivitySubject(prepared.event),
    "Ticket E12345678T, E87654321A — Representation consent received",
  );
});

Deno.test("manual consent mismatched audit/scan hash or foreign scan never reaches email", async () => {
  const { invite, inviteEvent } = await manualFixture();
  for (
    const patch of [
      { pdf_sha256: "0".repeat(64) },
      { manual_scan_pdf_sha256: "0".repeat(64) },
      {
        manual_scan_pdf_path:
          `manual/${submissionId}/${claimId}/signed-scan.pdf`,
      },
      { status: "signing" },
      { access_revoked_at: "2026-09-20T18:00:00Z" },
    ]
  ) {
    await assertRejects(() =>
      preparePortalConsentEmail(
        database({ ...invite, ...patch }, "representation_consent_invites").db,
        inviteEvent,
      )
    );
  }
});

async function workerScenario(
  options: {
    missingTicket?: boolean;
    providerFailure?: boolean;
    completionFailure?: boolean;
    reservationFailure?: boolean;
  } = {},
) {
  const originalFetch = globalThis.fetch;
  const settings = {
    SUPABASE_URL: "https://staff-consent.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
    IDR_CRON_SECRET: "synthetic-cron",
    GOOGLE_OAUTH_CLIENT_ID: "synthetic-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "synthetic-secret",
    GOOGLE_OAUTH_REFRESH_TOKEN: "synthetic-refresh",
    GOOGLE_WORKSPACE_SENDER: "hello@fabsy.ca",
  };
  const saved = Object.fromEntries(
    Object.keys(settings).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(settings)) Deno.env.set(key, value);
  const patches: Record<string, unknown>[] = [];
  const completions: Record<string, unknown>[] = [];
  let providerCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body && String(init.body).startsWith("{")
      ? JSON.parse(String(init.body))
      : null;
    if (url.pathname.endsWith("/claim_portal_activity_events")) {
      return Response.json([{ ...event, claim_token: claimId }]);
    }
    if (url.pathname.endsWith("/ticket_submissions")) {
      return Response.json(
        options.missingTicket ? { ...ticket, ticket_number: "" } : ticket,
      );
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      return new Response(pdf, {
        headers: { "Content-Type": "application/pdf" },
      });
    }
    if (url.pathname.endsWith("/portal_activity_events")) {
      patches.push(body);
      assertStringIncludes(url.search, "claim_token=eq.");
      return body.last_error === "consent_provider_request_started"
        ? Response.json(options.reservationFailure ? null : { id: event.id })
        : new Response(null, { status: 204 });
    }
    if (url.hostname === "oauth2.googleapis.com") {
      return Response.json({
        access_token: "synthetic-token",
        expires_in: 3600,
      });
    }
    if (url.hostname === "gmail.googleapis.com") {
      providerCalls++;
      assertEquals(patches[0].last_error, "consent_provider_request_started");
      const mime = atob(
        String(body.raw).replaceAll("-", "+").replaceAll("_", "/"),
      );
      assertStringIncludes(mime, "To: hello@fabsy.ca\r\n");
      assertEquals(mime.includes("brett@execom.ca"), false);
      if (options.providerFailure) {
        throw new Error("synthetic uncertain provider failure");
      }
      return Response.json({ id: "synthetic-gmail-id" });
    }
    if (url.pathname.endsWith("/complete_portal_activity_event")) {
      completions.push(body);
      return Response.json(!options.completionFailure);
    }
    if (url.pathname.endsWith("/portal_activity_state")) {
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected offline route");
  };
  try {
    const response = await handler(
      new Request("https://worker.example.test", {
        method: "POST",
        headers: { "x-cron-secret": settings.IDR_CRON_SECRET },
      }),
    );
    return {
      status: response.status,
      result: await response.json(),
      providerCalls,
      patches,
      completions,
    };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("worker records one accepted consent only after durable reservation", async () => {
  const result = await workerScenario();
  assertEquals(result.status, 200);
  assertEquals(result.providerCalls, 1);
  assertEquals(result.result.sent, 1);
  assertEquals(result.patches.length, 1);
  assertEquals(result.completions[0].p_provider_id, "synthetic-gmail-id");
});

Deno.test("worker refuses provider send when durable reservation was not acquired", async () => {
  const result = await workerScenario({ reservationFailure: true });
  assertEquals(result.providerCalls, 0);
  assertEquals(
    result.completions[0].p_error,
    "consent_delivery_reservation_failed",
  );
});

Deno.test("worker retries missing ticket without calling Gmail", async () => {
  const result = await workerScenario({ missingTicket: true });
  assertEquals(result.providerCalls, 0);
  assertEquals(result.patches.length, 0);
  assertEquals(result.completions[0].p_provider_id, null);
  assertEquals(
    result.completions[0].p_error,
    "consent_ticket_reference_required",
  );
});

Deno.test("worker holds uncertain consent provider outcome rather than retrying", async () => {
  const result = await workerScenario({ providerFailure: true });
  assertEquals(result.providerCalls, 1);
  assertEquals(result.completions.length, 0);
  assertEquals(result.patches[1].status, "needs_review");
  assertEquals(result.patches[1].last_error, "consent_delivery_uncertain");
  assertEquals(result.result.held, 1);
});

Deno.test("worker preserves known Gmail ID when completion write fails and never records retry", async () => {
  const result = await workerScenario({ completionFailure: true });
  assertEquals(result.providerCalls, 1);
  assertEquals(result.completions.length, 1);
  assertEquals(result.completions[0].p_provider_id, "synthetic-gmail-id");
  assertEquals(result.patches[1].status, "needs_review");
  assertEquals(result.patches[1].provider_email_id, "synthetic-gmail-id");
});
