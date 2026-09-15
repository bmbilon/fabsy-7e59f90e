import {
  type NotificationLocaleContext,
  prepareClientEmail,
} from "./notification-locale.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const DEFAULT_SENDER = "hello@fabsy.ca";

export interface WorkspaceEmailAttachment {
  filename: string;
  /** Base64-encoded attachment bytes. */
  content: string;
  contentType?: string;
}

export interface WorkspaceEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
  attachments?: WorkspaceEmailAttachment[];
  localization?: NotificationLocaleContext;
}

export interface WorkspaceEmailReceipt {
  id: string;
  threadId?: string;
}

interface WorkspaceCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sender: string;
}

interface TokenCache {
  key: string;
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function env(name: string): string {
  return Deno.env.get(name)?.trim() || "";
}

export function workspaceSender(): string {
  return DEFAULT_SENDER;
}

function credentials(): WorkspaceCredentials {
  const clientId = env("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = env("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_OAUTH_REFRESH_TOKEN");
  const configuredSender = env("GOOGLE_WORKSPACE_SENDER").toLowerCase();
  const sender = workspaceSender();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GOOGLE_WORKSPACE_EMAIL_NOT_CONFIGURED");
  }
  if (configuredSender && configuredSender !== DEFAULT_SENDER) {
    throw new Error("GOOGLE_WORKSPACE_SENDER_MUST_BE_HELLO_AT_FABSY");
  }
  return { clientId, clientSecret, refreshToken, sender };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

function utf8Base64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8Base64(value)}?=`;
}

function assertHeader(value: string, label: string): string {
  const clean = String(value || "").trim();
  if (!clean || /[\r\n\0]/.test(clean)) {
    throw new Error(`INVALID_EMAIL_${label.toUpperCase()}`);
  }
  return clean;
}

function mailbox(value: string): string {
  const match = assertHeader(value, "from").match(
    /<([^<>]+)>\s*$|^([^<>\s]+)$/,
  );
  return String(match?.[1] || match?.[2] || "").trim().toLowerCase();
}

function assertAddress(value: string, label: string): string {
  const clean = assertHeader(value, label);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean)) {
    throw new Error(`INVALID_EMAIL_${label.toUpperCase()}`);
  }
  return clean;
}

async function accessToken(): Promise<string> {
  const config = credentials();
  const cacheKey = `${config.clientId}|${config.sender}`;
  if (
    tokenCache?.key === cacheKey && tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.accessToken;
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(
      `GOOGLE_WORKSPACE_TOKEN_REJECTED_${response.status}_${
        result.error || "unknown"
      }`,
    );
  }
  tokenCache = {
    key: cacheKey,
    accessToken: result.access_token,
    expiresAt: Date.now() +
      Math.max(60, Number(result.expires_in || 3600)) * 1000,
  };
  return result.access_token;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mimeType(filename: string, supplied?: string): string {
  if (supplied) return assertHeader(supplied, "content_type");
  const extension = filename.toLowerCase().split(".").pop();
  return ({
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    txt: "text/plain",
    csv: "text/csv",
  } as Record<string, string>)[extension || ""] || "application/octet-stream";
}

function foldBase64(value: string): string {
  const normalized = value.replace(/\s/g, "");
  if (normalized && !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("INVALID_EMAIL_ATTACHMENT_CONTENT");
  }
  return normalized.match(/.{1,76}/g)?.join("\r\n") || "";
}

async function deterministicMessageId(idempotencyKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(idempotencyKey),
  );
  return `<${base64Url(new Uint8Array(digest))}@mail.fabsy.ca>`;
}

export async function buildWorkspaceMime(
  source: WorkspaceEmailPayload,
  idempotencyKey: string,
): Promise<string> {
  const sender = workspaceSender();
  if (
    !idempotencyKey || idempotencyKey.length > 256 ||
    /[\r\n\0]/.test(idempotencyKey)
  ) {
    throw new Error("INVALID_EMAIL_IDEMPOTENCY_KEY");
  }
  if (mailbox(source.from) !== sender) {
    throw new Error("EMAIL_FROM_MUST_BE_HELLO_AT_FABSY");
  }
  if (
    !Array.isArray(source.to) || source.to.length === 0 || source.to.length > 50
  ) {
    throw new Error("INVALID_EMAIL_RECIPIENTS");
  }
  const to = source.to.map((value) => assertAddress(value, "recipient"));
  const subject = assertHeader(source.subject, "subject");
  const from = assertHeader(source.from, "from");
  const replyTo = source.reply_to
    ? assertAddress(source.reply_to, "reply_to")
    : null;
  const headers = Object.entries(source.headers || {}).map(([name, value]) => {
    if (
      !/^[A-Za-z0-9-]{1,78}$/.test(name) ||
      /^(?:from|to|subject|reply-to|date|message-id|mime-version|content-type)$/i
        .test(name)
    ) {
      throw new Error("INVALID_EMAIL_CUSTOM_HEADER");
    }
    return `${name}: ${assertHeader(value, "custom_header")}`;
  });
  const alternative = `fabsy_alt_${crypto.randomUUID().replaceAll("-", "")}`;
  const mixed = `fabsy_mix_${crypto.randomUUID().replaceAll("-", "")}`;
  const plain = source.text?.trim() || htmlToText(source.html);
  const common = [
    `From: ${encodeHeader(from)}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${await deterministicMessageId(idempotencyKey)}`,
    `X-Fabsy-Idempotency-Key: ${
      base64Url(new TextEncoder().encode(idempotencyKey))
    }`,
    ...headers,
    "MIME-Version: 1.0",
  ];
  const alternativeBody = [
    `--${alternative}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(utf8Base64(plain)),
    `--${alternative}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(utf8Base64(source.html)),
    `--${alternative}--`,
  ].join("\r\n");
  const attachments = source.attachments || [];
  if (!attachments.length) {
    return [
      ...common,
      `Content-Type: multipart/alternative; boundary="${alternative}"`,
      "",
      alternativeBody,
    ].join("\r\n");
  }
  const attachmentBodies = attachments.map((attachment) => {
    const filename = assertHeader(attachment.filename, "attachment_filename")
      .replaceAll('"', "'");
    return [
      `--${mixed}`,
      `Content-Type: ${
        mimeType(filename, attachment.contentType)
      }; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      foldBase64(attachment.content),
    ].join("\r\n");
  });
  return [
    ...common,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    alternativeBody,
    ...attachmentBodies,
    `--${mixed}--`,
  ].join("\r\n");
}

export async function sendWorkspaceEmail(
  payload: WorkspaceEmailPayload,
  idempotencyKey = `fabsy/${crypto.randomUUID()}`,
): Promise<WorkspaceEmailReceipt> {
  const { localization, ...englishPayload } = payload;
  const outgoing = localization
    ? prepareClientEmail(englishPayload, localization)
    : englishPayload;
  const mime = await buildWorkspaceMime(outgoing, idempotencyKey);
  const token = await accessToken();
  const response = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(mime)) }),
  });
  const result = await response.json().catch(() => ({})) as {
    id?: string;
    threadId?: string;
    error?: { message?: string };
  };
  if (!response.ok || !result.id) {
    throw new Error(
      `GOOGLE_WORKSPACE_SEND_REJECTED_${response.status}_${
        result.error?.message || "unknown"
      }`,
    );
  }
  return { id: result.id, threadId: result.threadId };
}

export interface GmailMessageSummary {
  id: string;
  threadId?: string;
}

export async function listWorkspaceMessages(
  query: string,
  maxResults = 25,
): Promise<GmailMessageSummary[]> {
  const token = await accessToken();
  const params = new URLSearchParams({
    q: assertHeader(query, "gmail_query"),
    maxResults: String(Math.max(1, Math.min(100, Math.trunc(maxResults)))),
  });
  const response = await fetch(`${GMAIL_API}/users/me/messages?${params}`, {
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({})) as {
    messages?: GmailMessageSummary[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `GOOGLE_WORKSPACE_LIST_REJECTED_${response.status}_${
        result.error?.message || "unknown"
      }`,
    );
  }
  return result.messages || [];
}

export async function getWorkspaceMessage(id: string): Promise<unknown> {
  const cleanId = assertHeader(id, "gmail_message_id");
  if (!/^[A-Za-z0-9_-]+$/.test(cleanId)) {
    throw new Error("INVALID_GMAIL_MESSAGE_ID");
  }
  const token = await accessToken();
  const response = await fetch(
    `${GMAIL_API}/users/me/messages/${cleanId}?format=full`,
    {
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const result = await response.json().catch(() => ({})) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `GOOGLE_WORKSPACE_GET_REJECTED_${response.status}_${
        result.error?.message || "unknown"
      }`,
    );
  }
  return result;
}
