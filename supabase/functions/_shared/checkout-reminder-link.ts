const eventIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const linkOrigin = "https://fabsy.ca";
const linkPath = "/complete-ticket";
const tokenPattern = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/;
export const reminderResumeLifetimeMs = 7 * 24 * 60 * 60 * 1000;

async function reminderKey(secret: string) {
  if (secret.length < 32) throw new Error("REMINDER_RESUME_KEY_NOT_CONFIGURED");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const signedMessage = (id: string) => new TextEncoder().encode("ticket-checkout-reminder-resume/v1/" + id);

export function checkoutReminderResumeUrl(token: string) {
  if (!tokenPattern.test(token)) throw new Error("INVALID_REMINDER_RESUME_TOKEN");
  return linkOrigin + linkPath + "#reminder=" + token;
}

export async function mintCheckoutReminderResumeUrl(id: string, secret: string) {
  if (!eventIdPattern.test(id)) throw new Error("INVALID_REMINDER_EVENT");
  const proof = new Uint8Array(await crypto.subtle.sign("HMAC", await reminderKey(secret), signedMessage(id)));
  return checkoutReminderResumeUrl(id + "." + Array.from(proof, byte => byte.toString(16).padStart(2, "0")).join(""));
}

export async function checkoutReminderEventId(token: unknown, secret: string) {
  const match = typeof token === "string" && tokenPattern.exec(token);
  if (!match || !eventIdPattern.test(match[1]) || secret.length < 32) return null;
  const proof = Uint8Array.from(match[2].match(/../g)!, byte => parseInt(byte, 16));
  return await crypto.subtle.verify("HMAC", await reminderKey(secret), proof, signedMessage(match[1])) ? match[1] : null;
}

export function savedReminderLink(url: string) {
  if (!url.startsWith(linkOrigin + linkPath + "#reminder=")) return false;
  return tokenPattern.test(url.slice((linkOrigin + linkPath + "#reminder=").length));
}
