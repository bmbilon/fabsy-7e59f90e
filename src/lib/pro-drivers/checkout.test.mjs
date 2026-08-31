import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-pro-checkout-tests-"));
const virtualConsole = new VirtualConsole();
// JSDOM deliberately does not navigate to the returned Stripe URL.
virtualConsole.on("jsdomError", error => { if (!String(error.message).includes("navigation")) throw error; });
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://fabsy.test/submit-ticket", pretendToBeVisual: true, virtualConsole });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "File", "FileReader", "MutationObserver", "HTMLInputElement"]) {
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

try {
  const outfile = path.join(temporary, "PaymentStep.mjs");
  const mocks = {
    "@/integrations/supabase/client": `export const supabase = { functions: { invoke: (name, options) => globalThis.__proCheckoutTest.invoke(name, options) }, storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } };`,
    "@/i18n/locale-context": `export const useLocale = () => ({ locale: globalThis.__proCheckoutTest.locale || "en", isReleased: true, href: path => path });`,
    "@/hooks/use-toast": `export const useToast = () => ({ toast: value => globalThis.__proCheckoutTest.toasts.push(value) });`,
    "@/lib/referrals/capture": `export const referralForCheckout = async () => globalThis.__proCheckoutTest.referral;`,
    "react-i18next": `export const useTranslation = () => ({ t: key => key });`,
  };
  await build({
    entryPoints: [fileURLToPath(new URL("../../components/form-steps/PaymentStep.tsx", import.meta.url))], bundle: true, platform: "node", format: "esm", jsx: "automatic", outfile, logLevel: "silent",
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: "isolated-checkout-services", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "checkout-test" };
        if (/^(react|react-dom|react-router-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: "checkout-test" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { MemoryRouter } = await import("react-router-dom");
  const { default: PaymentStep } = await import(pathToFileURL(outfile).href);
  const tickUntil = async predicate => {
    for (let i = 0; i < 100; i += 1) {
      if (predicate()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.ok(predicate(), "Checkout did not reach the expected step");
  };
  const referral = {
    code: "FRIEND123", attributedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(), attributionToken: "signed-referral-fixture-token",
  };
  for (const scenario of [
    { name: "verified officer", licenceClass: "1", response: { verified: true, status: "verified", discountPercent: 20 }, expected: "158.40" },
    { name: "verified bundle", licenceClass: "2", addon: true, response: { verified: true, status: "verified", discountPercent: 20 }, expected: "183.20" },
    { name: "class mismatch", licenceClass: "4", response: { verified: false, status: "class_mismatch", discountPercent: 0 }, expected: "198.00" },
    { name: "verification unavailable", licenceClass: "1", error: true, expected: "198.00" },
    { name: "missing licence photo", licenceClass: "4", noPhoto: true, expected: "198.00" },
    { name: "Class 5 excluded", licenceClass: "5", expected: "198.00" },
    { name: "camera excluded", licenceClass: "1", camera: true, expected: "79.00" },
    ...["pa", "tl", "zh-hans", "zh-hant", "ar", "hi", "es"].flatMap(locale => [
      { name: `${locale} ordinary officer remains open`, locale, licenceClass: "unknown", expected: "198.00" },
      { name: `${locale} pro handoff requires English`, locale, licenceClass: "1", blocked: true },
      { name: `${locale} photo handoff requires English`, locale, licenceClass: "unknown", camera: true, blocked: true },
    ]),
  ]) {
    const calls = [];
    let releaseVerification;
    const verificationGate = new Promise(resolve => { releaseVerification = resolve; });
    globalThis.__proCheckoutTest = {
      referral, toasts: [], locale: scenario.locale || "en",
      invoke: async (name, { body }) => {
        calls.push({ name, body });
        if (name === "submit-ticket") return { error: null, data: { success: true, submissionId: "submission-fixture", clientId: "client-fixture", accessToken: "submission-access-token-fixture", upload: { path: "submission-fixture/ticket.jpg", token: "signed-upload-fixture" } } };
        if (name === "verify-pro-licence") { await verificationGate; return { error: scenario.error ? new Error("offline") : null, data: scenario.response ?? null }; }
        if (name === "generate-consent-form") return { error: null, data: { success: true, consentFormPath: "private/consent.pdf" } };
        if (name === "send-notification") return { error: null, data: { success: true } };
        if (name === "create-payment") return { error: null, data: { url: "https://checkout.stripe.test/test-only" } };
        throw new Error(`Unexpected endpoint: ${name}`);
      },
    };
    const formData = {
      sourceAssessmentId: "", sourceAssessmentAccessToken: "", firstName: "Test", lastName: "Driver", email: "test@example.test", phone: "4035550100",
      address: "Test address", city: "Calgary", province: "Alberta", postalCode: "T2P1J9", dateOfBirth: new Date("1990-01-01T12:00:00Z"), driversLicense: "TEST-LICENCE",
      licenceClass: scenario.licenceClass, driversLicenseImage: scenario.noPhoto ? null : new File(["test-image-fixture"], "licence.jpg", { type: "image/jpeg" }),
      ticketType: scenario.camera ? "photo_radar" : "officer_issued", ticketTypeSource: "manual", registeredOwnerOnOffenceDate: scenario.camera ? "yes" : "",
      ticketImage: new File(["test-ticket-fixture"], "ticket.jpg", { type: "image/jpeg" }), ticketNumber: "TICKET-TEST", fineAmount: "200", location: "Calgary", courtJurisdiction: "Calgary",
      issueDate: new Date("2026-08-30T12:00:00Z"), offenceDescription: "Test offence", pleaType: "not_guilty", explanation: "Test details", circumstances: "", additionalNotes: "",
      consentGiven: true, digitalSignature: "Test Driver", insuranceCompany: "", referral, plateNumber: "TEST123", pro_verified: true, proVerified: true, discount_applied: "PRO20",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(PaymentStep, { formData, updateFormData: () => {} }))));
    assert.ok(!container.textContent.includes("$158.40") && !container.textContent.includes("$183.20"), `${scenario.name}: injected client flags must not display a discount`);
    if (scenario.blocked) {
      assert.equal(container.querySelector("button"), null, `${scenario.name}: no untranslated payment action`);
      assert.equal(container.querySelector("input[type=checkbox]"), null, `${scenario.name}: no untranslated purchase acceptance`);
      const continuation = container.querySelector("a");
      assert.equal(continuation?.getAttribute("href"), scenario.camera ? "/submit-ticket?ticket_type=photo_radar" : "/submit-ticket?ticket_type=officer_issued");
      assert.ok(container.textContent.includes("pricing and authorization are available in English"));
      assert.deepEqual(calls, [], `${scenario.name}: no submission, upload, verification, message or payment is attempted`);
      await act(async () => root.unmount());
      container.remove();
      continue;
    }
    assert.ok(container.querySelector('a[href="/terms-of-purchase"]'), `${scenario.name}: English purchase terms remain linked`);
    if (scenario.addon) await act(async () => container.querySelector("#idr-addon").click());
    await act(async () => container.querySelector(scenario.locale ? "#localized-payment-terms" : "#payment-terms").click());
    const button = [...container.querySelectorAll("button")].find(element => element.textContent.includes("Stripe") || element.textContent.includes("$79 + GST") || element.textContent.includes("checkout.pay"));
    assert.ok(button && !button.disabled, `${scenario.name}: checkout should be available`);
    await act(async () => button.click());
    const shouldVerify = ["1", "2", "4"].includes(scenario.licenceClass) && !scenario.noPhoto && !scenario.camera;
    await tickUntil(() => calls.some(call => call.name === (shouldVerify ? "verify-pro-licence" : "create-payment")));
    if (shouldVerify) {
      assert.equal(calls.some(call => call.name === "create-payment"), false, "Verification must finish before checkout creation");
      assert.ok(!container.textContent.includes("discount verified"), "Autofill/pending requests must not claim verification");
      const verifyBody = calls.find(call => call.name === "verify-pro-licence").body;
      assert.equal(verifyBody.submissionId, "submission-fixture");
      assert.equal(verifyBody.accessToken, "submission-access-token-fixture");
      assert.equal(verifyBody.licenceClass, scenario.licenceClass);
      assert.ok(verifyBody.imageBase64.startsWith("data:image/jpeg;base64,"));
      await act(async () => releaseVerification());
      await tickUntil(() => calls.some(call => call.name === "create-payment"));
    } else assert.equal(calls.some(call => call.name === "verify-pro-licence"), false);
    assert.ok(container.textContent.includes(`$${scenario.expected} CAD`), `${scenario.name}: correct subtotal is shown`);
    const submitted = calls.find(call => call.name === "submit-ticket").body;
    assert.equal(submitted.preferred_locale, scenario.locale || "en");
    assert.equal(submitted.declaredLicenceClass, scenario.camera ? "unknown" : scenario.licenceClass);
    assert.equal(submitted.refCode, referral.code);
    assert.equal(submitted.refAttributionToken, referral.attributionToken);
    assert.equal(submitted.plateNumber, "TEST123");
    assert.ok(!JSON.stringify(submitted).includes("base64"), "Licence bytes are sent only to the bound verification endpoint");
    const checkout = calls.find(call => call.name === "create-payment").body;
    assert.deepEqual(Object.keys(checkout.formData).sort(), ["email", "firstName", "lastName", "ticketNumber"], "Checkout receives no client discount flags or documents");
    assert.equal(checkout.includeIdrAddon, scenario.addon === true);
    if (scenario.error || scenario.response?.verified === false) assert.ok(globalThis.__proCheckoutTest.toasts.some(toast => toast.title === "Continuing at full price"));
    if (scenario.camera) assert.equal(container.querySelector("#idr-addon"), null);
    await act(async () => root.unmount());
    container.remove();
  }
  console.log("Checkout component: verified-only prices, bound evidence, safe payloads, full-price fallbacks and English-only new-product gates passed (28 scenarios, including all7 ordinary localized checkouts). No external services called.");
} finally {
  delete globalThis.__proCheckoutTest;
  dom.window.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
