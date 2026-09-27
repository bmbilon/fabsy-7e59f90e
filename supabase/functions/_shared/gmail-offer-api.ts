import { buildWorkspaceMime, workspaceAccessToken, type WorkspaceEmailPayload } from "./google-workspace-email.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
async function request(path: string, init: RequestInit = {}) {
  const token = await workspaceAccessToken();
  const response = await fetch(`${API}${path}`, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`GMAIL_OFFER_API_${response.status}`);
  return await response.json();
}

export async function verifyOfferMailbox() {
  const profile = await request("/profile");
  if (profile.emailAddress?.toLowerCase() !== "hello@fabsy.ca") {
    throw new Error("OFFER_MAILBOX_MUST_BE_HELLO_AT_FABSY");
  }
}

// Exhaust pagination or fail explicitly; never silently truncate scan coverage.
export async function listOfferMessages(query: string): Promise<{ id: string }[]> {
  const messages: { id: string }[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ q: query, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await request(`/messages?${params}`);
    messages.push(...(result.messages || []));
    pageToken = result.nextPageToken || "";
    if (!pageToken) return messages;
  }
  throw new Error("OFFER_SCAN_TOO_MANY_PAGES");
}

export async function createOfferDraft(payload: WorkspaceEmailPayload, key: string) {
  const mime = await buildWorkspaceMime(payload, key);
  const bytes = new TextEncoder().encode(mime);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const raw = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  // This module intentionally has no send/update/delete endpoint.
  const result = await request("/drafts", { method: "POST", body: JSON.stringify({ message: { raw } }) });
  if (!result.id || !result.message?.id) throw new Error("GMAIL_DRAFT_RECEIPT_MISSING");
  return { draft_id: String(result.id), message_id: String(result.message.id) };
}
