// A signed alias for an existing intake capability. Issuing a follow-up does
// not rotate the customer's current token, copy the ticket, or create a case.
export const COMPLETION_TOKEN_PATTERN = /^c1\.[0-9a-f]{32}\.[0-9a-f]{64}\.[0-9]{10}\.[0-9a-f]{64}$/;
export const INTAKE_ACCESS_TOKEN_PATTERN = /^(?:[0-9a-f]{64}|c1\.[0-9a-f]{32}\.[0-9a-f]{64}\.[0-9]{10}\.[0-9a-f]{64})$/;
const utf8 = (value: string) => new TextEncoder().encode(value);
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
const message = (body: string) => utf8(`fabsy-ticket-completion-v1:${body}`);

async function signingKey(secret: string) {
  if (!secret) throw new Error("Completion signing is not configured.");
  return await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createTicketCompletionUrl(input: {
  draftId: string; accessTokenHash: string; expiresAt: string; secret: string; siteUrl?: string;
}) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.draftId) ||
      !/^[0-9a-f]{64}$/.test(input.accessTokenHash)) throw new Error("Invalid completion source.");
  const expires = Math.floor(Date.parse(input.expiresAt) / 1000);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() / 1000) throw new Error("Completion source expired.");
  const body = `c1.${input.draftId.replaceAll("-", "")}.${input.accessTokenHash}.${expires}`;
  const signature = hex(await crypto.subtle.sign("HMAC", await signingKey(input.secret), message(body)));
  const url = new URL("/complete-ticket", input.siteUrl || "https://fabsy.ca");
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Completion URL must use HTTPS.");
  url.hash = new URLSearchParams({ access: `${body}.${signature}` }).toString();
  return url.toString();
}

/** Always compare the result to the CURRENT stored hash: rotation revokes aliases. */
export async function intakeAccessTokenHash(token: string, secret: string, expectedId?: string, now = Date.now()): Promise<string> {
  if (!token.startsWith("c1.")) return hex(await crypto.subtle.digest("SHA-256", utf8(token)));
  if (!secret || !COMPLETION_TOKEN_PATTERN.test(token)) return "";
  const [, id, hash, expires, signature] = token.split(".");
  if (Number(expires) * 1000 <= now || (expectedId && id !== expectedId.toLowerCase().replaceAll("-", ""))) return "";
  const bytes = new Uint8Array(signature.match(/../g)!.map(value => parseInt(value, 16)));
  const verified = await crypto.subtle.verify("HMAC", await signingKey(secret), bytes, message(token.slice(0, token.lastIndexOf("."))));
  return verified ? hash : "";
}

export function validTicketCompletionUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://fabsy.ca" && url.pathname === "/complete-ticket" && !url.search &&
      !url.username && !url.password && COMPLETION_TOKEN_PATTERN.test(new URLSearchParams(url.hash.slice(1)).get("access") || "");
  } catch { return false; }
}
