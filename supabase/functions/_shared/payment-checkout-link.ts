export const PAYMENT_LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function siteOrigin(configured: string | undefined): string {
  let parsed: URL;
  try {
    parsed = new URL(configured || "https://fabsy.ca");
  } catch {
    throw new Error("SITE_URL is invalid.");
  }
  const local = parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("SITE_URL must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("SITE_URL must not contain credentials.");
  }
  return parsed.origin;
}

export function generatePaymentLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const code = btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (!PAYMENT_LINK_CODE_PATTERN.test(code)) {
    throw new Error("Could not create a payment-link code.");
  }
  return code;
}

export function paymentCheckoutUrl(
  configuredSiteUrl: string | undefined,
  code: string,
): string {
  if (!PAYMENT_LINK_CODE_PATTERN.test(code)) {
    throw new Error("The payment-link code is invalid.");
  }
  return new URL(`/pay/${code}`, `${siteOrigin(configuredSiteUrl)}/`).toString();
}
