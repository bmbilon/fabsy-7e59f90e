import { savedReminderLink } from "./checkout-reminder-link.ts";
import { getFabsyEmailSignature, getFabsyEmailSignatureText } from "./email-signature.ts";
import { prepareClientEmail, prepareClientSms } from "./notification-locale.ts";
import type { WorkspaceEmailPayload } from "./google-workspace-email.ts";

export interface CheckoutReminderContext {
  valid: boolean;
  ticket_number: string;
  review_reason: string | null;
  paid: boolean;
  consented: boolean;
  email: string;
  phone: string;
  sms_opt_in: boolean;
  preferred_locale: string;
}
export interface CheckoutReminderEvent {
  id: string;
  campaign_id: string;
  stage: number;
  claim_token: string;
  context: CheckoutReminderContext;
}
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function reminderPhone(value: string): string | null {
  if (!/^[+()\d\s.-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}
export function reminderChannel(ctx: CheckoutReminderContext): { channel: "email" | "sms"; recipient: string } {
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(ctx.email)) return { channel: "email", recipient: ctx.email };
  const phone = ctx.sms_opt_in ? reminderPhone(ctx.phone) : null;
  if (phone) return { channel: "sms", recipient: phone };
  throw new Error("NO_PERMITTED_REMINDER_CONTACT");
}
export function reminderCopy(ctx: CheckoutReminderContext, stage: number, resumeUrl?: string) {
  if (!ctx.valid || ctx.review_reason || !/^[A-Z0-9]{5,30}$/.test(ctx.ticket_number) || !/\d/.test(ctx.ticket_number) ||
    ![1, 2, 3].includes(stage) || (ctx.paid && ctx.consented)) throw new Error("REMINDER_NOT_ELIGIBLE");
  const steps = ctx.paid ? "submit your consent" : ctx.consented ? "complete payment" : "complete payment and submit your consent";
  if (resumeUrl && !savedReminderLink(resumeUrl)) throw new Error("INVALID_REMINDER_RESUME_URL");
  const link = resumeUrl || (ctx.paid ? "https://fabsy.ca/consent" : ctx.consented ? "https://fabsy.ca/payment" : "https://fabsy.ca/checkout");
  const intro = stage === 1 ? "Thanks for uploading your ticket." : stage === 2 ? "A quick reminder about your ticket." : "A final reminder about your ticket.";
  const receipt = ctx.paid ? "Your payment has been recorded. " : ctx.consented ? "Your consent has been received. " : "";
  return { steps, link, intro, receipt };
}
export function reminderEmail(ctx: CheckoutReminderContext, stage: number, stopUrl: string, resumeUrl?: string): WorkspaceEmailPayload {
  const { steps, link, intro, receipt } = reminderCopy(ctx, stage, resumeUrl);
  if (!stopUrl.startsWith("https://") || /[\r\n]/.test(stopUrl)) throw new Error("INVALID_REMINDER_STOP_URL");
  const text = `${intro}\n\nTicket ${ctx.ticket_number}\n\n${receipt}Please ${steps} so we can proceed with your ticket. You do not need to upload the same ticket again.\n\n${link}\n\nIf you need help, reply to this email or call 825-793-2279.\n\nStop these reminders: ${stopUrl}\n\n${getFabsyEmailSignatureText({ includeServiceOffer: false })}`;
  const localization = { preferredLocale: ctx.preferred_locale, template: "checkout_reminder" as const };
  const fallback = prepareClientSms("", localization).trim();
  return prepareClientEmail({ from: "Fabsy Traffic Ticket Services <hello@fabsy.ca>", to: [ctx.email],
    reply_to: "hello@fabsy.ca", subject: `Ticket ${ctx.ticket_number} — ${stage === 3 ? "Final reminder to complete your intake" : "Complete your intake"}`,
    text: fallback ? `${fallback}\n\n${text}` : text,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.6"><h2>Ticket ${escape(ctx.ticket_number)}</h2><p>${intro}</p><p>${receipt}Please ${steps} so we can proceed with your ticket. You do not need to upload the same ticket again.</p><p><a href="${link}">Complete your ${ctx.paid ? "consent" : ctx.consented ? "payment" : "payment and consent"}</a></p><p>Need help? Reply to this email or call <a href="tel:+18257932279">825-793-2279</a>.</p><p style="font-size:12px"><a href="${escape(stopUrl)}">Stop these reminders</a></p>${getFabsyEmailSignature({ signOff: true, includeServiceOffer: false })}</div>`,
    headers: { "List-Unsubscribe": `<${stopUrl}>`, "X-Fabsy-Reminder-Stage": String(stage) },
  }, localization);
}
export function reminderSms(ctx: CheckoutReminderContext, stage: number, resumeUrl?: string): string {
  const { steps, link, receipt } = reminderCopy(ctx, stage, resumeUrl);
  return prepareClientSms(`Fabsy${stage === 3 ? " final reminder" : " reminder"} - Ticket ${ctx.ticket_number}: ${receipt}Please ${steps} so we can proceed with your ticket: ${link} Reply STOP to opt out.`,
    { preferredLocale: ctx.preferred_locale, template: "checkout_reminder" });
}
export async function reminderMessageId(id: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ticket-checkout-reminder/${id}`)));
  const base64 = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `<${base64}@mail.fabsy.ca>`;
}
export async function reminderStopToken(campaign: string, secret: string): Promise<string> {
  if (!/^[a-f0-9-]{36}$/.test(campaign) || secret.length < 32) throw new Error("REMINDER_STOP_KEY_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`ticket-checkout-reminder-stop/v1/${campaign}`)));
  return `${campaign}.${Array.from(signed).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function equalSecret(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  return x.reduce((difference, byte, i) => difference | (byte ^ y[i]), 0) === 0;
}
export async function validateStopToken(token: string, secret: string): Promise<string | null> {
  if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token) || secret.length < 32) return null;
  const campaign = token.split(".")[0];
  return await equalSecret(token, await reminderStopToken(campaign, secret)) ? campaign : null;
}
