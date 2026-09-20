import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gmailMessageToIncomingEmail, pollDisclosureConfirmations } from "./gmail-disclosure-inbox.ts";
import { parseConfirmation } from "./disclosure-confirmation.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const base64Url = (value: string) =>
  btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

Deno.test("Gmail API messages are converted into bounded disclosure parser input", async () => {
  const incoming = gmailMessageToIncomingEmail({
    id: "gmail-fixture-id",
    internalDate: String(new Date("2026-09-15T13:00:00Z").getTime()),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Alberta Courts <noreply@gov.ab.ca>" },
        { name: "To", value: "Fabsy <hello@fabsy.ca>" },
        { name: "Subject", value: "Disclosure Request Submitted" },
        { name: "Message-ID", value: "<crown-fixture@gov.ab.ca>" },
        { name: "Date", value: "Tue, 15 Sep 2026 07:00:00 -0600" },
        {
          name: "Authentication-Results",
          value:
            "mx.google.com; dkim=pass header.i=@gov.ab.ca; dmarc=pass header.from=gov.ab.ca",
        },
      ],
      parts: [{
        mimeType: "text/plain",
        body: {
          data: base64Url(
            "Your request for disclosure has been received. A disclosure request for ticket T12345678Z was submitted. Disclosure can take 8 weeks.",
          ),
        },
      }],
    },
  });
  assertEquals(incoming.from?.email, "noreply@gov.ab.ca");
  assertEquals(incoming.to?.[0].email, "hello@fabsy.ca");
  assertStringIncludes(incoming.text || "", "T12345678Z");
  const parsed = await parseConfirmation(
    incoming,
    new Date("2026-09-15T14:00:00Z"),
  );
  assertEquals(parsed?.parse_error, null);
  assertEquals(parsed?.ticket_number, "T12345678Z");
});

const now = new Date("2026-09-20T15:00:00Z");
const clone = <T>(value: T): T => structuredClone(value);

function inboxFixture(total = 55) {
  const state = { cursor: null as unknown, failSave: false, failMessage: "", fetched: [] as string[],
    queries: [] as string[], ingested: new Set<string>(), elapsed: 0 };
  const db = {
    from(table: string) {
      assertEquals(table, "disclosure_automation_state");
      let change: { inbox_poll_cursor: unknown } | undefined;
      let expected: unknown;
      const query = {
        select() { return query; },
        update(value: { inbox_poll_cursor: unknown }) { change = value; return query; },
        eq(field: string, value: unknown) {
          if (field === "inbox_poll_cursor") expected = JSON.parse(String(value));
          else { assertEquals(field, "id"); assertEquals(value, true); }
          return query;
        },
        is(field: string, value: unknown) { assertEquals(field, "inbox_poll_cursor"); expected = value; return query; },
        single() { return Promise.resolve({ data: { inbox_poll_cursor: clone(state.cursor) }, error: null }); },
        maybeSingle() {
          if (state.failSave || JSON.stringify(expected) !== JSON.stringify(state.cursor)) return Promise.resolve({ data: null, error: null });
          state.cursor = clone(change!.inbox_poll_cursor);
          return Promise.resolve({ data: { id: true }, error: null });
        },
      };
      return query;
    },
    rpc(name: string, args: { p_event: { source_message_id: string } }) {
      assertEquals(name, "ingest_disclosure_confirmation");
      state.ingested.add(args.p_event.source_message_id);
      return Promise.resolve({ data: { status: "matched" }, error: null });
    },
  } as unknown as SupabaseClient;
  const transport = {
    list(query: string, limit = 10, pageToken?: string) {
      assertEquals(limit, 10);
      state.queries.push(query);
      const start = Number(pageToken || 0);
      return Promise.resolve({ messages: Array.from({ length: Math.max(0, Math.min(limit, total - start)) },
        (_, i) => ({ id: `message-${start + i}` })),
        ...(start + limit < total ? { nextPageToken: String(start + limit) } : {}) });
    },
    get(id: string) {
      if (id === state.failMessage) return Promise.reject(new Error("Temporary fetch failure"));
      state.fetched.push(id);
      return Promise.resolve({ id, payload: { mimeType: "text/plain", headers: [
        { name: "From", value: "noreply@gov.ab.ca" }, { name: "To", value: "hello@fabsy.ca" },
        { name: "Subject", value: "Disclosure Request Submitted" }, { name: "Message-ID", value: id },
        { name: "Date", value: now.toUTCString() },
        { name: "Authentication-Results", value: "mx.google.com; dmarc=pass header.from=gov.ab.ca" },
      ], body: { data: base64Url("Your request for disclosure has been received. A disclosure request for ticket T12345678Z was submitted.") } } });
    },
  };
  return { state, db, transport };
}

Deno.test("more than fifty acknowledgements resume through every page with a bounded batch", async () => {
  const { state, db, transport } = inboxFixture();
  const first = await pollDisclosureConfirmations(db, now, transport);
  assertEquals(first.inspected, 20); assertEquals(first.has_more, true);
  const second = await pollDisclosureConfirmations(db, new Date(now.getTime() + 60_000), transport);
  assertEquals(second.inspected, 20); assertEquals(second.has_more, true);
  const third = await pollDisclosureConfirmations(db, new Date(now.getTime() + 120_000), transport);
  assertEquals(third.inspected, 15); assertEquals(third.has_more, false);
  assertEquals(state.ingested.size, 55);
  assertEquals(new Set(state.fetched).size, 55);
  assertEquals(new Set(state.queries).size, 1);
  assertEquals(state.cursor, null);
});

Deno.test("a failed message remains first in the durable queue and resumes without skipping", async () => {
  const { state, db, transport } = inboxFixture(8);
  state.failMessage = "message-3";
  await assertRejects(() => pollDisclosureConfirmations(db, now, transport));
  assertEquals((state.cursor as { pending_ids: string[] }).pending_ids[0], "message-3");
  state.failMessage = "";
  const resumed = await pollDisclosureConfirmations(db, now, transport);
  assertEquals(resumed.inspected, 5); assertEquals(state.ingested.size, 8);
  assertEquals(state.fetched.length, 8); assertEquals(state.cursor, null);
});

Deno.test("time budget persists pending IDs and a contending poller cannot overwrite progress", async () => {
  const { state, db, transport } = inboxFixture(8);
  const slow = { ...transport, get: async (id: string) => { const value = await transport.get(id); state.elapsed += 46_000; return value; } };
  const stopped = await pollDisclosureConfirmations(db, now, slow, () => state.elapsed);
  assertEquals(stopped.inspected, 1);
  assertEquals((state.cursor as { pending_ids: string[] }).pending_ids[0], "message-1");
  const saved = clone(state.cursor);
  state.failSave = true;
  await pollDisclosureConfirmations(db, now, transport);
  assertEquals(state.cursor, saved);
  state.failSave = false;
  await pollDisclosureConfirmations(db, now, transport);
  assertEquals(state.ingested.size, 8); assertEquals(state.cursor, null);
});

Deno.test("only an explicit invalid page token restarts the same fixed window", async () => {
  const { state, db, transport } = inboxFixture(35);
  await pollDisclosureConfirmations(db, now, transport);
  const saved = clone(state.cursor);
  await assertRejects(() => pollDisclosureConfirmations(db, now, {
    ...transport, list: () => Promise.reject(new Error("Temporary list failure")),
  }));
  assertEquals(state.cursor, saved);
  const reset = await pollDisclosureConfirmations(db, new Date(now.getTime() + 60_000), {
    ...transport, list: () => Promise.reject(new Error("GOOGLE_WORKSPACE_PAGE_TOKEN_INVALID")),
  });
  assertEquals(reset.cursor_reset, true);
  assertEquals((state.cursor as { window_end: string; resets: number }).window_end, now.toISOString());
  assertEquals((state.cursor as { resets: number }).resets, 1);
  await pollDisclosureConfirmations(db, now, transport);
  await pollDisclosureConfirmations(db, now, transport);
  assertEquals(state.ingested.size, 35); assertEquals(state.cursor, null);
});
