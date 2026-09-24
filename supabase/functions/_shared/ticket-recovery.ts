import { prepareClientEmail, prepareClientSms } from "./notification-locale.ts";
import type { WorkspaceEmailPayload } from "./google-workspace-email.ts";

export type RecoverySnapshot = {
  eligible: boolean;
  reason: string | null;
  email: string;
  phone: string;
  can_email: boolean;
  sms_opt_in: boolean;
  first_name: string;
  ticket_number: string;
  paid: boolean;
  has_consent: boolean;
  mode: "checkout" | "payment" | "consent";
  uploaded_at: string;
  legacy_sent_at: string | null;
  session_ids: string[];
  preferred_locale: string;
};
export type RecoveryJob = {
  id: string;
  source_kind: string;
  source_id: string;
  channel: "email" | "sms";
  stage: number;
  claim_id: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const singleLine = (s: string) =>
  // deno-lint-ignore no-control-regex
  s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").trim().slice(
    0,
    120,
  );
export const completionUrl = (s: RecoverySnapshot) =>
  `https://fabsy.ca/${s.mode}`;
export function channelHold(
  s: RecoverySnapshot,
  channel: "email" | "sms",
): string | null {
  if (!s.eligible) return s.reason || "source_unavailable";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9 -]{2,49}$/.test(s.ticket_number) ||
    !/\d/.test(s.ticket_number)
  ) return "ticket_number_required";
  if (channel === "email" && !s.can_email) return "email_unavailable";
  if (channel === "sms" && !s.sms_opt_in) return "sms_opt_in_required";
  if (channel === "sms" && !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(s.phone)) {
    return "phone_unavailable";
  }
  return null;
}
export function recoveryMessage(
  s: RecoverySnapshot,
  unsubscribeUrl: string,
  mailingAddress: string,
  oneClickUrl = unsubscribeUrl,
): { email: WorkspaceEmailPayload; sms: string } {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9 -]{2,49}$/.test(s.ticket_number) ||
    !/\d/.test(s.ticket_number)
  ) throw new Error("ticket_number_required");
  if (mailingAddress.trim().length < 12) {
    throw new Error("mailing_address_required");
  }
  const needed = {
    checkout: "consent and payment",
    consent: "consent",
    payment: "payment",
  }[s.mode];
  if (!needed) throw new Error("completion_mode_invalid");
  const url = completionUrl(s);
  const subject = `Ticket ${s.ticket_number} — Complete your ${needed}`;
  const copy = s.mode === "payment"
    ? `We have your ticket and consent. Your service payment is still outstanding.`
    : s.mode === "consent"
    ? `Your service payment is recorded. We still need your authorization to act on ticket ${s.ticket_number}.`
    : `We have your uploaded ticket ${s.ticket_number}. Please complete your authorization and service payment to continue.`;
  const contact =
    "Use the same email address you used for your ticket, and enter the ticket number shown above so we can match it. You do not need to upload the ticket again.";
  const questions =
    "If you already completed this, please reply so we can check the record. You can also reply with any questions.";
  const footer = `Fabsy · ${
    singleLine(mailingAddress)
  }\nhello@fabsy.ca · (825) 793-2279`;
  const text = [
    `Hi ${singleLine(s.first_name) || "there"},`,
    copy,
    `Complete ${needed}: ${url}`,
    contact,
    questions,
    footer,
    `Stop these reminders: ${unsubscribeUrl}`,
  ].join("\n\n");
  const email = prepareClientEmail({
    from: "Fabsy <hello@fabsy.ca>",
    to: [s.email],
    reply_to: "hello@fabsy.ca",
    subject,
    text,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    html:
      `<!doctype html><html lang="en"><body style="font:16px/1.6 Arial,sans-serif;color:#172033;max-width:600px;margin:24px auto;padding:16px"><p>Hi ${
        escape(singleLine(s.first_name) || "there")
      },</p><p>${
        escape(copy)
      }</p><p><a style="display:inline-block;background:#15715b;color:white;padding:12px 18px;border-radius:6px;text-decoration:none" href="${url}">Complete ${needed}</a></p><p>${
        escape(contact)
      }</p><p>${escape(questions)}</p><hr><p style="font-size:13px">${
        escape(footer).replaceAll("\n", "<br>")
      }<br><a href="${
        escape(unsubscribeUrl)
      }">Stop these reminders</a></p></body></html>`,
  }, { preferredLocale: s.preferred_locale, template: "case_update" });
  const sms = prepareClientSms(
    `Fabsy: Ticket ${s.ticket_number}. Please complete ${needed}: ${url} Use the same email and ticket number. Questions? (825) 793-2279. ${
      singleLine(mailingAddress)
    }. Reply STOP to opt out.`,
    { preferredLocale: s.preferred_locale, template: "case_update" },
  );
  return { email, sms };
}

/** Fail closed when payment status cannot be verified, including webhook lag and standalone payment links. */
export async function stripeRecoveryHold(
  s: RecoverySnapshot,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (s.paid) return null;
  if (!key) return "payment_check_unavailable";
  const request = async (path: string) => {
    const response = await fetcher(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("payment_check_unavailable");
    return await response.json();
  };
  try {
    for (const id of s.session_ids) {
      if (!/^cs_(live|test)_[A-Za-z0-9_]+$/.test(id)) {
        return "payment_check_unavailable";
      }
      const session = await request(
        `checkout/sessions/${encodeURIComponent(id)}`,
      );
      if (
        session.id !== id ||
        !["paid", "unpaid", "no_payment_required"].includes(
          session.payment_status,
        ) || !["open", "complete", "expired"].includes(session.status)
      ) return "payment_check_unavailable";
      if (
        session.payment_status !== "unpaid" || session.status === "complete"
      ) return "stripe_payment_reconciliation_required";
    }
    if (!s.email) return "payment_identity_required";
    let cursor = "";
    const created = Math.floor((Date.parse(s.uploaded_at) - 86400000) / 1000);
    if (!Number.isFinite(created)) return "payment_check_unavailable";
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({
        limit: "100",
        "created[gte]": String(created),
      });
      if (cursor) query.set("starting_after", cursor);
      const result = await request(`checkout/sessions?${query}`);
      if (!Array.isArray(result.data) || typeof result.has_more !== "boolean") {
        return "payment_check_unavailable";
      }
      for (const session of result.data) {
        const email = String(
          session.customer_details?.email || session.customer_email || "",
        ).trim().toLowerCase();
        if (
          email === s.email &&
          (session.payment_status === "paid" ||
            session.payment_status === "no_payment_required" ||
            session.status === "complete")
        ) return "stripe_payment_reconciliation_required";
      }
      if (!result.has_more) return null;
      cursor = result.data.at(-1)?.id;
      if (!cursor) return "payment_check_unavailable";
    }
    return "payment_check_incomplete";
  } catch {
    return "payment_check_unavailable";
  }
}

export type RecoveryDependencies = {
  snapshot: (job: RecoveryJob) => Promise<RecoverySnapshot>;
  providerHold: (
    s: RecoverySnapshot,
    job: RecoveryJob,
  ) => Promise<string | null>;
  begin: (job: RecoveryJob, s: RecoverySnapshot) => Promise<boolean>;
  send: (job: RecoveryJob, s: RecoverySnapshot) => Promise<string>;
  finish: (
    job: RecoveryJob,
    status: string,
    reason: string | null,
    provider: string | null,
  ) => Promise<boolean>;
};
export async function deliverRecovery(
  job: RecoveryJob,
  deps: RecoveryDependencies,
): Promise<string> {
  let attempted = false;
  const finish = async (
    status: string,
    reason: string | null = null,
    provider: string | null = null,
  ) => {
    if (!await deps.finish(job, status, reason, provider)) {
      throw new Error("receipt_not_saved");
    }
    return status;
  };
  try {
    const snapshot = await deps.snapshot(job);
    const hold = channelHold(snapshot, job.channel) ||
      await deps.providerHold(snapshot, job);
    if (hold) {
      return await finish(
        [
            "complete",
            "case_closed",
            "intake_closed",
            "staff_followed_up",
            "unsubscribed",
          ].includes(hold)
          ? "suppressed"
          : "held",
        hold,
      );
    }
    if (!await deps.begin(job, snapshot)) {
      return await finish("held", "source_changed");
    }
    attempted = true;
    const provider = await deps.send(job, snapshot);
    return await finish("sent", null, provider);
  } catch {
    // Gmail and Twilio do not guarantee idempotent POST. An uncertain attempt is NEVER automatically retried.
    try {
      return await finish(
        attempted ? "uncertain" : "held",
        attempted ? "provider_receipt_uncertain" : "preflight_unavailable",
      );
    } catch {
      return "recording_failed";
    }
  }
}

export async function unsubscribeSignature(
  id: string,
  secret: string,
): Promise<string> {
  if (secret.length < 32) throw new Error("unsubscribe_key_missing");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(`ticket-recovery-unsubscribe-v1:${id}`),
      ),
    ),
  ].map((x) => x.toString(16).padStart(2, "0")).join("");
}
