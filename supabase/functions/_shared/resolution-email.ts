// Pure rendering/eligibility helpers. Calling these functions never sends email.
export const REFERRAL_INVITATION = "Know a driver with a ticket? $50 when they sign up with your link.";
export const REFERRAL_EMAIL_TERMS = "$50 for an eligible officer-issued ticket; $20 for an eligible camera ticket. Payment must settle and the file must be accepted, followed by seven days. Terms apply.";

export async function resolutionPreviewFingerprint(contract: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(contract));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function resolutionCopy(ticketType: unknown, outcome: unknown) {
  const camera = ticketType === "photo_radar";
  const subject = "Your Fabsy case result is ready";
  const heading = "Your case result is ready";
  let mainCopy: string;
  if (outcome === "withdrawn") {
    mainCopy = `The recorded outcome for your ${camera ? "automated enforcement " : ""}ticket is withdrawn. Open your private case page for the final result and any remaining steps.`;
  } else if (outcome === "reduced") {
    mainCopy = `The recorded outcome for your ${camera ? "automated enforcement " : ""}ticket is reduced. Open your private case page for the confirmed details and any remaining payment or deadline instructions.`;
  } else if (camera && outcome === "unchanged") {
    mainCopy = "The recorded monetary penalty for your automated enforcement ticket is unchanged. Open your private case page for the final result and any remaining payment or deadline instructions.";
  } else if (!camera && outcome === "conviction_stands") {
    mainCopy = "The recorded outcome shows that the conviction stands. Open your private case page for the final result and the next steps that apply to your file.";
  } else if (!camera && outcome === "other") {
    mainCopy = "A final result has been recorded for your ticket. Open your private case page for the confirmed result and any remaining steps.";
  } else {
    return null;
  }
  return { subject, heading, mainCopy };
}

export function referralInvitationAvailability(input: {
  enabled: boolean;
  mailingAddress: string;
  checkoutCreatedAt: string | null;
  now?: Date;
}): { available: boolean; reason: string | null } {
  if (!input.enabled || input.mailingAddress.trim().length < 12) {
    return { available: false, reason: "Referral invitations are disabled until business mailing details and the consent/unsubscribe process are configured." };
  }
  const now = input.now || new Date();
  const paidPurchase = new Date(input.checkoutCreatedAt || "");
  const earliest = new Date(now);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 2);
  // A recent, server-confirmed paid purchase is necessary but not sufficient:
  // the sending operator must still check consent and any unsubscribe request.
  if (!Number.isFinite(paidPurchase.getTime()) || paidPurchase > now || paidPurchase < earliest) {
    return { available: false, reason: "This purchase is outside the supported referral-invitation window. Send the case result without an invitation." };
  }
  return { available: true, reason: null };
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function referralInvitationHtml(code: string, mailingAddress: string, siteUrl: string): string {
  if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Error("A valid referral code is required");
  const shareUrl = `${siteUrl}/r/${encodeURIComponent(code)}`;
  return `<p style="line-height:1.65;"><a href="${escapeEmailHtml(shareUrl)}">${REFERRAL_INVITATION}</a></p>
    <p style="font-size:12px;line-height:1.5;color:#4b5563;">${REFERRAL_EMAIL_TERMS} <a href="${escapeEmailHtml(siteUrl)}/refer#referral-terms">Referral terms</a>.</p>
    <p style="font-size:12px;line-height:1.5;color:#4b5563;">Fabsy · ${escapeEmailHtml(mailingAddress)}<br>
      To stop referral invitations, reply “unsubscribe” or <a href="mailto:hello@fabsy.ca?subject=Unsubscribe%20from%20referral%20invitations">email hello@fabsy.ca</a>. Case-service updates are separate.</p>`;
}
