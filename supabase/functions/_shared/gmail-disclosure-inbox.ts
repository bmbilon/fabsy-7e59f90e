import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getWorkspaceMessage,
  listWorkspaceMessagesPage,
} from "./google-workspace-email.ts";
import {
  type IncomingEmail,
  parseConfirmation,
} from "./disclosure-confirmation.ts";

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id?: string;
  internalDate?: string;
  payload?: GmailPart;
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
  );
}

function headerValues(part: GmailPart, name: string): string[] {
  return (part.headers || [])
    .filter((header) => header.name?.toLowerCase() === name.toLowerCase())
    .map((header) => String(header.value || "").trim())
    .filter(Boolean);
}

function address(value: string): string {
  const match = value.match(/<([^<>]+)>\s*$|([^\s,<>]+@[^\s,<>]+)$/);
  return String(match?.[1] || match?.[2] || "").trim().toLowerCase();
}

function addresses(values: string[]): { email: string }[] {
  return values.flatMap((value) => value.split(","))
    .map(address)
    .filter(Boolean)
    .map((email) => ({ email }));
}

function bodies(
  part: GmailPart | undefined,
  found: { text: string[]; html: string[] },
) {
  if (!part) return found;
  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType?.toLowerCase() === "text/plain") found.text.push(decoded);
    else if (part.mimeType?.toLowerCase() === "text/html") {
      found.html.push(decoded);
    }
  }
  for (const child of part.parts || []) bodies(child, found);
  return found;
}

export function gmailMessageToIncomingEmail(value: unknown): IncomingEmail {
  const message = value as GmailMessage;
  const payload = message?.payload || {};
  const content = bodies(payload, { text: [], html: [] });
  const from = address(headerValues(payload, "from")[0] || "");
  const date = headerValues(payload, "date")[0] || (
    /^\d+$/.test(message.internalDate || "")
      ? new Date(Number(message.internalDate)).toUTCString()
      : ""
  );
  const headers = Object.fromEntries(
    (payload.headers || []).reduce((entries, header) => {
      const name = String(header.name || "").toLowerCase();
      const value = String(header.value || "").trim();
      if (!name || !value) return entries;
      const existing = entries.get(name) || [];
      existing.push(value);
      entries.set(name, existing);
      return entries;
    }, new Map<string, string[]>()).entries(),
  );
  return {
    from: { email: from },
    to: addresses(headerValues(payload, "to")),
    subject: headerValues(payload, "subject")[0] || "",
    "message-id": headerValues(payload, "message-id")[0] || message.id || "",
    date,
    text: content.text.join("\n\n"),
    html: content.html.join("\n\n"),
    headers,
  };
}

interface InboxCursor {
  version: 1;
  window_end: string;
  page_token: string | null;
  pending_ids: string[];
  page_loaded: boolean;
  resets: number;
}

function readCursor(value: unknown): InboxCursor | null {
  if (value === null) return null;
  const cursor = value as InboxCursor;
  if (!cursor || cursor.version !== 1 || typeof cursor.window_end !== "string"
    || !Number.isFinite(Date.parse(cursor.window_end)) || typeof cursor.page_loaded !== "boolean"
    || !Number.isInteger(cursor.resets) || cursor.resets < 0
    || (cursor.page_token !== null && (typeof cursor.page_token !== "string" || !cursor.page_token
      || cursor.page_token.length > 4096 || /[\r\n\0]/.test(cursor.page_token)))
    || !Array.isArray(cursor.pending_ids) || cursor.pending_ids.length > 10
    || cursor.pending_ids.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id))
    || (!cursor.page_loaded && cursor.pending_ids.length > 0)) throw new Error("DISCLOSURE_INBOX_CURSOR_INVALID");
  return cursor;
}

export async function pollDisclosureConfirmations(
  db: SupabaseClient,
  now = new Date(),
  transport = { list: listWorkspaceMessagesPage, get: getWorkspaceMessage },
  clock = Date.now,
) {
  const started = clock();
  const { data: state, error: stateError } = await db.from("disclosure_automation_state")
    .select("inbox_poll_cursor").eq("id", true).single();
  if (stateError || !state) throw new Error("DISCLOSURE_INBOX_CURSOR_READ_FAILED");
  let cursor = readCursor(state.inbox_poll_cursor);
  // Commit progress only if no other poller advanced it. Repeated source IDs are
  // safe to ingest, but a stale worker must never rewind or skip another's cursor.
  const advance = async (next: InboxCursor | null) => {
    let update = db.from("disclosure_automation_state").update({ inbox_poll_cursor: next }).eq("id", true);
    update = cursor === null ? update.is("inbox_poll_cursor", null)
      : update.eq("inbox_poll_cursor", JSON.stringify(cursor));
    const { data, error } = await update.select("id").maybeSingle();
    if (error) throw new Error("DISCLOSURE_INBOX_CURSOR_SAVE_FAILED");
    if (!data) return false;
    cursor = next;
    return true;
  };
  let inspected = 0;
  let ingested = 0;
  let ignored = 0;
  let pages = 0;
  const result = (extra = {}) => ({ inspected, ingested, ignored, has_more: cursor !== null, cursor_reset: false, ...extra });
  if (!cursor && !await advance({ version: 1, window_end: now.toISOString(), page_token: null,
    pending_ids: [], page_loaded: false, resets: 0 })) return result({ contended: true });
  while (cursor && inspected < 20 && clock() - started < 45_000) {
    const current: InboxCursor = cursor;
    if (current.pending_ids.length) {
      const mail = gmailMessageToIncomingEmail(await transport.get(current.pending_ids[0]));
      const event = await parseConfirmation(mail, new Date(current.window_end));
      if (event) {
        const { error } = await db.rpc("ingest_disclosure_confirmation", { p_event: event });
        if (error) throw new Error("DISCLOSURE_CONFIRMATION_INGEST_FAILED");
        ingested++;
      } else ignored++;
      inspected++;
      if (!await advance({ ...current, pending_ids: current.pending_ids.slice(1) })) return result({ contended: true });
      continue;
    }
    if (current.page_loaded && !current.page_token) {
      if (!await advance(null)) return result({ contended: true });
      break;
    }
    if (pages >= 2) break;
    const before = Math.floor(Date.parse(current.window_end) / 1000) + 1;
    const query = `from:noreply@gov.ab.ca to:hello@fabsy.ca subject:"Disclosure Request Submitted" after:${before - 7 * 86400 - 1} before:${before}`;
    let page;
    try { page = await transport.list(query, 10, current.page_token || undefined); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "GOOGLE_WORKSPACE_PAGE_TOKEN_INVALID") throw error;
      // Restart the same fixed window, not a newer slice. Previously ingested
      // source IDs remain deduplicated and older unseen messages remain included.
      if (!await advance({ ...current, page_token: null, pending_ids: [], page_loaded: false, resets: current.resets + 1 })) {
        return result({ contended: true });
      }
      return result({ cursor_reset: true });
    }
    pages++;
    if (page.messages.length > 10) throw new Error("DISCLOSURE_INBOX_PAGE_TOO_LARGE");
    if (!await advance({ ...current, pending_ids: page.messages.map(message => message.id),
      page_token: page.nextPageToken || null, page_loaded: true })) return result({ contended: true });
  }
  return result();
}
