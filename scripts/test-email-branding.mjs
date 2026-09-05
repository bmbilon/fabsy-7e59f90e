import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Exercise the real contact handler and shared signature. Only the HTTP server
// registration and outbound email provider are replaced; no delivery is possible.
const root = resolve(import.meta.dirname, "..");
const compiled = await build({
  absWorkingDir: root,
  entryPoints: ["supabase/functions/send-contact-email/index.ts"],
  bundle: true,
  write: false,
  platform: "neutral",
  format: "cjs",
  logLevel: "silent",
  plugins: [{
    name: "offline-email-boundaries",
    setup(bundler) {
      bundler.onResolve({ filter: /^https:\/\/deno\.land\/std@0\.190\.0\/http\/server\.ts$/ }, () => ({ path: "serve", namespace: "offline-email" }));
      bundler.onResolve({ filter: /^npm:resend@2\.0\.0$/ }, () => ({ path: "resend", namespace: "offline-email" }));
      bundler.onLoad({ filter: /.*/, namespace: "offline-email" }, ({ path }) => ({
        contents: path === "serve"
          ? "export const serve = handler => { globalThis.__handler = handler; };"
          : "export class Resend { emails = { send: body => globalThis.__send(body) }; }",
        loader: "js",
      }));
    },
  }],
});
const script = compiled.outputFiles[0].text;
const LOGO = "https://fabsy.ca/apple-touch-icon.png?v=4";
const fixture = {
  name: "QA Preview", email: "preview@example.test", phone: "4035550100",
  subject: "Synthetic branding preview", message: "Preview only. No real ticket or person. Do not process.",
};

async function run(body = fixture, failAt = 0) {
  const messages = [];
  const context = vm.createContext({
    Request, Response, URL, console: { log() {}, error() {} },
    Deno: { env: { get: () => "offline-placeholder" } },
    fetch() { throw new Error("Network is forbidden in email tests"); },
    __send: async message => {
      messages.push(message);
      return messages.length === failAt ? { error: { message: "Synthetic provider rejection" } } : { data: { id: `offline-${messages.length}` }, error: null };
    },
  });
  vm.runInContext(script, context);
  const response = await context.__handler(new Request("https://fabsy.invalid/contact", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { messages, response };
}

for (const inquiryType of ["contact", "fleet"]) {
  for (const locale of ["en", "pa", "tl", "zh-hans", "zh-hant", "ar", "hi", "es"]) {
    test(`${inquiryType}/${locale} preserves delivery, content and locale while using current branding`, async () => {
      const { response, messages } = await run({ ...fixture, inquiry_type: inquiryType, preferred_locale: locale });
      assert.equal(response.status, 200);
      assert.equal(messages.length, 2);
      const [client, admin] = messages;
      assert.equal(client.from, "Fabsy <hello@fabsy.ca>");
      assert.equal(client.reply_to, "brett@execom.ca");
      assert.deepEqual([...client.to], [fixture.email]);
      assert.equal(client.subject, inquiryType === "fleet" ? "We've Received Your Fleet Enquiry - Fabsy" : "We've Received Your Message - Fabsy");
      assert.equal(client.headers["Content-Language"], "en");
      assert.equal(client.headers["X-Fabsy-Preferred-Locale"], locale);
      assert.equal(client.headers["X-Fabsy-Notification-Template"], "contact_received");
      assert.equal(client.headers["X-Fabsy-Language-Fallback"], locale === "en" ? undefined : "translation_not_reviewed");
      assert.equal(admin.from, "Fabsy Notifications <hello@fabsy.ca>");
      assert.equal(admin.reply_to, fixture.email);
      assert.deepEqual([...admin.to], ["brett@execom.ca"]);
      assert.equal(admin.subject, `${inquiryType === "fleet" ? "Fleet Account Enquiry" : "New Contact Form Submission"} from ${fixture.name}`);

      const dom = new JSDOM(client.html);
      const doc = dom.window.document;
      assert.equal(doc.documentElement.lang, "en");
      assert.equal(doc.documentElement.dir, "ltr");
      assert.equal(doc.querySelector("h1").textContent, "Fabsy");
      assert.equal(doc.querySelectorAll("img").length, 2, "header and signature use the same authentic logo");
      for (const img of doc.querySelectorAll("img")) {
        assert.equal(img.src, LOGO);
        assert.equal(img.alt, "Fabsy");
        assert.ok(Number(img.width) > 0 && Number(img.height) > 0);
      }
      assert.equal(doc.querySelector("a.button").href, `https://fabsy.ca/${inquiryType === "fleet" ? "fleet" : "submit-ticket"}`);
      const text = doc.body.textContent.replace(/\s+/g, " ");
      assert.ok(text.includes("Traffic ticket agent services for Alberta drivers"));
      assert.ok(text.includes("Rapid Resolution is $198 CAD plus GST for eligible Alberta pre-trial matters. Trial and government fines are separate."));
      assert.ok(text.includes("Fabsy is an agent service for Alberta traffic matters, not a law firm."));
      assert.ok(text.includes(fixture.message));
      assert.ok(text.includes(inquiryType === "fleet"
        ? "This enquiry does not retain Fabsy or pause a deadline."
        : "Photo radar and red-light owner notices cost $79 + 5% GST ($82.95 total)."));
      for (const message of messages) {
        assert.doesNotMatch(message.html, /linear-gradient|#667eea|#764ba2|#E879F9|#C084FC|#A78BFA|#86198F|⚖️/i);
      }
      dom.window.close();

      if (process.env.FABSY_EMAIL_PREVIEW_DIR && locale === "en") {
        await mkdir(process.env.FABSY_EMAIL_PREVIEW_DIR, { recursive: true });
        await writeFile(resolve(process.env.FABSY_EMAIL_PREVIEW_DIR, `${inquiryType}-client.html`), client.html);
        await writeFile(resolve(process.env.FABSY_EMAIL_PREVIEW_DIR, `${inquiryType}-admin.html`), admin.html);
      }
    });
  }
}

test("contact confirmation still escapes supplied HTML rather than rendering it", async () => {
  const injected = '<img src="https://attacker.invalid/pixel" onerror="alert(1)">';
  const { response, messages } = await run({ ...fixture, name: injected, message: injected });
  assert.equal(response.status, 200);
  for (const message of messages) {
    const dom = new JSDOM(message.html);
    assert.equal(dom.window.document.querySelector('[onerror]'), null);
    assert.equal(dom.window.document.querySelector('img[src^="https://attacker.invalid"]'), null);
    assert.ok(dom.window.document.body.textContent.includes(injected));
    dom.window.close();
  }
});

for (const failAt of [1, 2]) {
  test(`provider failure ${failAt} still returns failure without retrying delivery`, async () => {
    const { response, messages } = await run(fixture, failAt);
    assert.equal(response.status, 500);
    assert.equal(messages.length, failAt);
  });
}

test("invalid contact input cannot send an email", async () => {
  const { response, messages } = await run({ ...fixture, email: "invalid" });
  assert.equal(response.status, 400);
  assert.equal(messages.length, 0);
});
