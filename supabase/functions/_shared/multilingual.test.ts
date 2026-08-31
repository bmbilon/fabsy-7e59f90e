import assert from "node:assert/strict";
import { LocaleRequestError, localizedPublicPath, parsePreferredLocale, requireReleasedServiceLocale, SUPPORTED_LOCALES } from "./locale-policy.ts";
import { notificationLocale, prepareClientEmail, prepareClientSms } from "./notification-locale.ts";
import { sendResendEmail } from "./resend-email.ts";
import { renderTicketAdminEmailHtml, renderTicketClientEmailHtml, type TicketNotification } from "./ticket-notification-html.ts";

Deno.test("Wave 1 API preserves every distinct script and accepts legacy English callers", () => {
  assert.equal(parsePreferredLocale(undefined), "en");
  for (const locale of SUPPORTED_LOCALES) assert.equal(parsePreferredLocale(locale), locale);
  assert.notEqual(parsePreferredLocale("zh-hans"), parsePreferredLocale("zh-hant"));
  for (const invalid of [null, "", "ur", "PA", "pa-IN", "fil", "zh", "zh-Hant", "ar\r\nBcc:other@example.test", {}, ["pa"], 2]) {
    assert.throws(() => parsePreferredLocale(invalid), (error: unknown) => {
      assert.ok(error instanceof LocaleRequestError);
      assert.equal(error.status, 400);
      return true;
    });
  }
});

Deno.test("server blocks unreviewed service locales by default and requires exact release attestation", () => {
  requireReleasedServiceLocale("en", undefined);
  for (const locale of SUPPORTED_LOCALES.filter((value) => value !== "en")) {
    assert.throws(() => requireReleasedServiceLocale(locale, undefined), (error: unknown) => {
      assert.ok(error instanceof LocaleRequestError);
      assert.equal(error.code, "locale_not_released");
      assert.equal(error.status, 409);
      return true;
    });
  }
  requireReleasedServiceLocale("pa", "pa, tl");
  requireReleasedServiceLocale("tl", "pa, tl");
  assert.throws(() => requireReleasedServiceLocale("ar", "pa,tl"));
  assert.throws(() => requireReleasedServiceLocale("pa", "pa-IN"));
  assert.throws(() => requireReleasedServiceLocale("pa", "*"));
});

Deno.test("public payment return paths preserve locale without changing the query or fragment", () => {
  assert.equal(localizedPublicPath("en", "/thank-you?session_id=synthetic#receipt"), "/thank-you?session_id=synthetic#receipt");
  assert.equal(localizedPublicPath("pa", "/thank-you?session_id=synthetic#receipt"), "/pa/thank-you?session_id=synthetic#receipt");
  assert.equal(localizedPublicPath("ar", "/payment-canceled"), "/ar/payment-canceled");
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/thank-you\r\nLocation:evil.test"]) {
    assert.throws(() => localizedPublicPath("pa", path));
  }
});

Deno.test("draft client notifications stay English even when the service locale is released", () => {
  const english = { subject: "Your ticket", html: "<p>You approve any deal. No outcome is promised.</p>" };
  for (const locale of SUPPORTED_LOCALES) {
    requireReleasedServiceLocale(locale, SUPPORTED_LOCALES.join(","));
    const context = { preferredLocale: locale, template: "ticket_received" as const };
    const selected = notificationLocale(context);
    const prepared = prepareClientEmail(english, context);
    assert.equal(selected.delivery_locale, "en");
    assert.equal(prepared.subject, english.subject);
    assert.ok(prepared.html.includes(english.html));
    assert.equal(prepared.headers["Content-Language"], "en");
    assert.equal(prepared.headers["X-Fabsy-Preferred-Locale"], locale);
    assert.equal(selected.fallback_reason, locale === "en" ? null : "translation_not_reviewed");
    assert.equal(prepared.html.includes("approved translation is not yet available"), locale !== "en");
  }
  assert.deepEqual(english, { subject: "Your ticket", html: "<p>You approve any deal. No outcome is promised.</p>" });
});

Deno.test("native intake text cannot inject HTML or hide English fallback in real notification templates", () => {
  const attack = 'ਹਰਪ੍ਰੀਤ & أَحْمَدُ <style>p{display:none}</style><body dir="rtl"><a href="https://untrusted.invalid">Guaranteed withdrawal</a> \'"';
  const original: TicketNotification = {
    preferredLocale: "pa", submissionId: 'case/"<img src=x onerror=1>',
    firstName: attack, lastName: attack, email: attack, phone: attack,
    ticketNumber: attack, violation: attack, fineAmount: attack, submittedAt: attack, smsOptIn: true,
  };
  const before = structuredClone(original);
  const context = { preferredLocale: original.preferredLocale, template: "ticket_received" as const };
  const admin = renderTicketAdminEmailHtml(original, "https://fabsy.ca");
  const client = prepareClientEmail({ subject: "Your Ticket Submission Confirmation", html: renderTicketClientEmailHtml(original) }, context);
  for (const html of [admin, client.html]) {
    assert.ok(html.includes("ਹਰਪ੍ਰੀਤ &amp; أَحْمَدُ"));
    assert.ok(html.includes('&lt;style&gt;p{display:none}&lt;/style&gt;'));
    assert.ok(html.includes('&lt;body dir=&quot;rtl&quot;&gt;'));
    assert.ok(html.includes('&lt;a href=&quot;https://untrusted.invalid&quot;&gt;'));
    assert.ok(html.includes('&#39;&quot;'));
    assert.ok(!html.includes("<style>"));
    assert.ok(!html.includes("<body"));
    assert.ok(!html.includes('<a href="https://untrusted.invalid"'));
    assert.ok(!html.includes("<img src=x"));
  }
  assert.ok(admin.includes("/admin/submissions/case%2F%22%3Cimg%20src%3Dx%20onerror%3D1%3E"));
  assert.ok(client.html.startsWith('<div lang="en" dir="ltr"><p lang="en" dir="ltr"'));
  assert.ok(client.html.includes("approved translation is not yet available"));
  assert.equal(client.headers["Content-Language"], "en");
  assert.deepEqual(original, before);
  assert.ok(prepareClientSms(original.violation, context).startsWith(attack));
});

Deno.test("Arabic preference does not give an English email RTL direction or break document markup", () => {
  const context = { preferredLocale: "ar", template: "contact_received" as const };
  const prepared = prepareClientEmail({ subject: "Thanks", html: '<!doctype html><html lang="ar" dir="rtl" data-test="yes"><head></head><body class="mail"><p>Original message: مرحبا</p></body></html>' }, context);
  assert.ok(prepared.html.startsWith("<!doctype html>"));
  assert.ok(prepared.html.includes('<html lang="en" dir="ltr" data-test="yes">'));
  assert.ok(prepared.html.includes('<body class="mail"><p lang="en"'));
  assert.ok(prepared.html.includes("Original message: مرحبا"));
  assert.ok(!prepared.html.includes('dir="rtl"'));
  assert.equal(prepareClientSms("Payment received.", { ...context, preferredLocale: "en" }), "Payment received.");
  assert.match(prepareClientSms("Payment received.", context), /English update; your Arabic preference is recorded/);
});

Deno.test("email transport carries fallback headers and preserves idempotency without sending", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  globalThis.fetch = (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    return Promise.resolve(new Response(JSON.stringify({ id: "synthetic-email-id" }), { status: 200 }));
  };
  try {
    const result = await sendResendEmail("synthetic-test-key", {
      from: "Fabsy <test@example.test>", to: ["recipient@example.test"], subject: "Synthetic", html: "<p>No outcome is promised.</p>",
      localization: { preferredLocale: "pa", template: "case_update" },
    }, "synthetic-case-update/1");
    assert.equal(result, "synthetic-email-id");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.get("Idempotency-Key"), "synthetic-case-update/1");
    assert.equal(requests[0].body.localization, undefined);
    assert.equal((requests[0].body.headers as Record<string, string>)["Content-Language"], "en");
    assert.match(String(requests[0].body.html), /You selected Punjabi/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
