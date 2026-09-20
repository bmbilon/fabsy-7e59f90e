import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { MessageChannel } from "node:worker_threads";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

// Mount the real combined upload/consent components against a synthetic
// DOM. Every backend boundary is disabled or explicitly controlled below;
// these fixtures never reach OCR, storage, checkout or a customer record.
const projectRoot = resolve(import.meta.dirname, "..");
const compiled = await build({
  absWorkingDir: projectRoot,
  stdin: {
    sourcefile: "ticket-upload-review-tests.tsx",
    resolveDir: projectRoot,
    loader: "tsx",
    contents: `
      import React, { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter } from 'react-router-dom';
      import TicketForm from './src/components/TicketForm';

      let root;
      export { act };
      export async function mount(props = {}) {
        root = createRoot(document.getElementById('root'));
        await act(async () => {
          root.render(<MemoryRouter initialEntries={['/submit-ticket']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <TicketForm {...props} />
          </MemoryRouter>);
        });
      }
      export async function unmount() {
        if (root) await act(async () => root.unmount());
      }
      export async function changeText(node, value) {
        const prototype = node instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        await act(async () => {
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      export async function chooseFile(node, file) {
        await act(async () => {
          Object.defineProperty(node, 'files', { configurable: true, value: file ? [file] : [] });
          node.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      export async function click(node) {
        await act(async () => node.click());
      }
    `,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "cjs",
  jsx: "automatic",
  logLevel: "silent",
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"test"' },
  plugins: [{
    name: "offline-ticket-review-boundaries",
    setup(bundler) {
      const modules = {
        backend: "export const supabase = { functions: { invoke: (...args) => globalThis.__ticketReviewBackend.invoke(...args) }, storage: { from: (bucket) => ({ uploadToSignedUrl: (...args) => globalThis.__ticketReviewBackend.upload(bucket, ...args) }) } };",
        translation: "export const useTranslation = () => ({ t: key => key });",
        locale: "const locale = { locale: 'en', isReleased: true, href: x => x, setIntakeHandoff() {} }; export const useLocale = () => locale;",
        toast: "const value = { toast() {} }; export const useToast = () => value;",
        cache: "const value = { getCachedTicketData: (...args) => globalThis.__ticketReviewBackend.readCache(...args), isCacheKeyValid: () => true }; export const useTicketCache = () => value;",
        referral: `
          export const REFERRAL_ATTRIBUTION_EVENT = 'offline-referral';
          export const readActiveReferral = () => null;
          export const captureReferralFromLocation = async () => null;
          export const captureReferralCode = async () => null;
          export const clearReferralAttribution = () => {};
          export const referralForCheckout = async () => null;
        `,
      };
      const boundaries = [
        [/integrations\/supabase\/client$/, "backend"],
        [/^react-i18next$/, "translation"],
        [/i18n\/locale-context$/, "locale"],
        [/hooks\/use-toast$/, "toast"],
        [/hooks\/useTicketCache$/, "cache"],
        [/lib\/referrals\/capture$/, "referral"],
      ];
      for (const [filter, path] of boundaries) {
        bundler.onResolve({ filter }, () => ({ path, namespace: "offline-review" }));
      }
      // The localized journey and legacy screens are outside this English
      // flow's coverage. Keep the combined intake and real checkout mounted.
      bundler.onResolve({ filter: /(?:^|\/)(PersonalInfoStep|DefenseStep|ConsentStep|ReviewStep|LocalizedTicketJourney|InstantTicketAnalyzer)$/ }, () => ({ path: "later-step", namespace: "offline-review" }));
      bundler.onLoad({ filter: /.*/, namespace: "offline-review" }, ({ path }) => ({
        contents: modules[path] ?? "export default function LaterStepBoundary() { return null; }",
        loader: "js",
      }));
    },
  }],
});

const script = compiled.outputFiles[0].text;
const completeTicket = {
  ticketNumber: "SYNTHETIC-TICKET-A",
  issueDate: "2026-06-01",
  location: "Example Avenue at Test Street",
  fineAmount: "200",
  // These optional fields can be absent on a real ticket. Their absence must
  // never force invented information or prevent progressing to personal info.
  officer: null,
  officerBadge: null,
  offenceSection: null,
  offenceSubSection: null,
  offenceDescription: null,
  courtDate: null,
};

async function runtime(t, props = {}, { cacheKey } = {}) {
  const domErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => domErrors.push(error));
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://fabsy.invalid/submit-ticket",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
    // Deliberately omit resources: images, scripts and styles cannot load.
  });
  const { window } = dom;
  const requests = [];
  const cacheRequests = [];
  const saves = [];
  let failUpload = false;
  let failConsent = false;
  let failContact = false;
  let failPrepare = false;
  let reviewStatus = "needs_review";
  let savedContact = { email: "", phone: "" };
  const forbidden = [];
  const channels = [];
  const deferredRequest = (queue, metadata) => new Promise((resolveRequest, rejectRequest) => {
    queue.push({ ...metadata, resolve: resolveRequest, reject: rejectRequest });
  });
  const blockNetwork = () => {
    forbidden.push("network");
    throw new Error("Network access is forbidden in ticket upload tests");
  };
  window.fetch = blockNetwork;
  window.XMLHttpRequest = class { constructor() { blockNetwork(); } };
  window.navigator.sendBeacon = blockNetwork;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.MessageChannel = class {
    constructor() {
      const channel = new MessageChannel();
      channels.push(channel);
      return channel;
    }
  };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  window.__ticketReviewBackend = {
    invoke(name, options) {
      if (name === "photo-ticket-intake") {
        saves.push({ name: options.body.action, body: options.body });
        if (options.body.action === "prepare") {
          if (failPrepare) return Promise.resolve({ data: null, error: new window.Error("Preparation response lost") });
          return Promise.resolve({ data: { success: true, submissionId: options.body.submissionId, clientId: "synthetic-client", accessToken: options.body.accessToken, upload: { path: options.body.submissionId + "/ticket.png", token: "synthetic-upload" } }, error: null });
        }
        if (options.body.action === "contact") {
          if (failContact) return Promise.resolve({ data: null, error: new window.Error("Contact save failed") });
          savedContact = { email: options.body.email, phone: options.body.phone };
        }
        return Promise.resolve({ data: { success: true, reviewStatus, fields: { firstName: "Alex", lastName: "Example", ticketNumber: "SCANNED-TICKET", ticketType: "officer_issued", registeredOwnerOnOffenceDate: "", ...savedContact } }, error: null });
      }
      if (name === "submit-ticket") {
        saves.push({ name, body: options.body });
        return Promise.resolve({ data: { success: true, submissionId: "synthetic-submission", clientId: "synthetic-client", accessToken: "synthetic-capability", upload: { path: "synthetic-submission/ticket.png", token: "synthetic-upload" } }, error: null });
      }
      if (name === "generate-consent-form") {
        saves.push({ name, body: options.body });
        return Promise.resolve(failConsent ? { data: null, error: new Error("Consent service unavailable") } : { data: { success: true, consentFormPath: "synthetic-submission/consent.pdf" }, error: null });
      }
      if (name === "send-notification" || name === "create-payment") {
        saves.push({ name, body: options.body });
        return Promise.resolve(name === "create-payment" ? { data: null, error: new window.Error("Synthetic checkout not opened") } : { data: {}, error: null });
      }
      if (name !== "ocr-ticket") {
        forbidden.push(name);
        throw new Error(`Unexpected backend call: ${name}`);
      }
      assert.match(options.body.imageBase64, /^data:image\/(png|jpeg|webp);base64,/);
      return deferredRequest(requests, { name });
    },
    upload(bucket, path, token, file) {
      saves.push({ name: "upload", bucket, path, token, file });
      return Promise.resolve({ error: failUpload ? new Error("Upload interrupted") : null });
    },
    readCache(key) {
      return deferredRequest(cacheRequests, { key });
    },
  };
  if (cacheKey) window.localStorage.setItem("ticket-cache-key", cacheKey);
  window.module = { exports: {} };
  window.eval(script);
  const api = window.module.exports;
  const document = window.document;
  t.after(async () => {
    await api.unmount();
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
    window.close();
    assert.deepEqual(forbidden, [], "the integration test must never attempt a real backend/network operation");
    assert.deepEqual(domErrors.map(error => error.message), [], "the mounted UI must not throw DOM/runtime errors");
  });
  await api.mount(props);

  const flush = async () => {
    await api.act(async () => { await new Promise(resolveTick => setTimeout(resolveTick, 0)); });
  };
  const until = async (predicate, message) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (predicate()) return;
      await flush();
    }
    assert.ok(predicate(), message);
  };
  const buttons = label => [...document.querySelectorAll("button")]
    .filter(node => node.textContent.replace(/\s+/g, " ").trim() === label);
  const button = label => {
    const found = buttons(label)[0];
    assert.ok(found, `Expected a ${label} button`);
    return found;
  };
  const continueBlocked = () => assert.equal(button("Submit ticket and consent").disabled, true);
  const continueEnabled = () => assert.equal(button("Submit ticket and consent").disabled, false);
  const hiddenDetails = () => assert.equal(document.getElementById("quick-ticketNumber"), null);
  const file = (name = "synthetic-ticket.png", mime = "image/png") => new window.File(["SYNTHETIC TEST CONTENT — NOT A REAL TICKET"], name, { type: mime });
  const choose = async selectedFile => {
    const browse = document.querySelector('input[type="file"][accept*="application/pdf"]');
    assert.ok(browse, "The file picker must continue to accept PDFs and images");
    await api.chooseFile(browse, selectedFile);
    await flush();
  };
  const waitForScan = async count => until(() => requests.length === count, `Expected ${count} mocked OCR request(s)`);
  const finish = async (index, data = completeTicket) => {
    assert.ok(requests[index], `Missing deferred scan ${index}`);
    await api.act(async () => requests[index].resolve({ data: { success: true, data }, error: null }));
    await flush();
  };
  const field = id => {
    const node = document.getElementById(id);
    assert.ok(node, `Expected the visible ${id} field`);
    return node;
  };
  const edit = async (id, value) => {
    await api.changeText(field(id), value);
    await flush();
  };
  const fill = async () => {
    for (const [key, value] of Object.entries({ firstName: "Alex", lastName: "Example", email: "alex@example.test", phone: "4035550123", driversLicense: "SYNTHETIC-LICENCE", ticketNumber: "SYNTHETIC-TICKET" })) await edit(`quick-${key}`, value);
  };
  const accept = async () => { if (!field("quick-consent").checked) await api.click(field("quick-consent")); };
  return { window, document, api, requests, cacheRequests, saves, flush, until, button, buttons, continueBlocked, continueEnabled, hiddenDetails, file, choose, waitForScan, finish, field, edit, fill, accept,
    failUpload: value => { failUpload = value; }, failConsent: value => { failConsent = value; }, failContact: value => { failContact = value; }, failPrepare: value => { failPrepare = value; }, readyForPayment: () => { reviewStatus = "ready"; } };
}

test("the upload form contains no ticket, identity, contact or referral fields and never waits for OCR", async t => {
  const app = await runtime(t);
  app.continueBlocked();
  assert.ok(app.document.querySelector('input[capture="environment"]'));
  await app.choose(app.file());
  assert.equal(app.requests.length, 0);
  assert.equal(app.document.querySelectorAll('input:not([type="file"]):not([type="checkbox"])').length, 0);
  assert.equal(app.document.querySelectorAll("select,textarea").length, 0);
  assert.equal((app.document.body.textContent.match(/Ticket attached/g) || []).length, 1);
  assert.doesNotMatch(app.document.body.textContent, /Check your details|Legal first name|Driver’s licence number|referral code|Enter any readable details|Scanning/);
  assert.equal(app.field("quick-consent").checked, false);
  app.continueBlocked(); await app.accept(); app.continueEnabled();
  assert.equal(app.saves.length, 0);
});

test("one click saves a photo and consent without sending invented or cached identity fields", async t => {
  const app = await runtime(t, { initialPrefill: { firstName: "Old", driversLicense: "OLD-LICENCE", ticketNumber: "OLD-TICKET" } });
  await app.choose(app.file()); await app.accept();
  await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  assert.deepEqual(app.saves.map(x => x.name), ["prepare", "upload", "generate-consent-form"]);
  const body = app.saves[0].body;
  assert.equal(body.consent.version, "photo-upload-consent-v2");
  assert.equal(body.consent.accepted, true); assert.equal(body.consent.method, "checkbox");
  for (const key of ["firstName", "lastName", "email", "phone", "driversLicense", "ticketNumber", "ticket_type"]) assert.equal(body[key], undefined);
  assert.equal(app.saves[2].body.digitalSignature, undefined);
  assert.match(app.document.body.textContent, /Success, Your ticket has been received/);
  assert.ok(app.field("updates-email")); assert.ok(app.field("updates-phone")); assert.ok(app.button("Accept"));
});

test("PDFs can submit without names, ticket numbers, DL, DOB or a successful scan", async t => {
  const app = await runtime(t);
  await app.choose(app.file("ticket.pdf", "application/pdf")); await app.accept();
  await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  assert.equal(app.requests.length, 0);
  assert.match(app.document.body.textContent, /Success, Your ticket has been received/);
});

test("the contact form accepts email only, phone only, or both after success", async t => {
  for (const values of [{ email: "alex@example.test", phone: "" }, { email: "", phone: "4035550123" }, { email: "alex@example.test", phone: "4035550123" }]) {
    await t.test(JSON.stringify(values), async st => {
      const app = await runtime(st);
      await app.choose(app.file()); await app.accept(); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
      if (values.email) await app.edit("updates-email", values.email);
      if (values.phone) await app.edit("updates-phone", values.phone);
      await app.api.click(app.button("Accept")); await app.flush();
      const contact = app.saves.find(x => x.name === "contact");
      assert.equal(contact.body.email, values.email); assert.equal(contact.body.phone, values.phone);
      assert.match(app.document.body.textContent, /Updates enabled/);
      assert.equal(app.saves.filter(x => x.name === "prepare").length, 1);
      assert.equal(app.saves.filter(x => x.name === "generate-consent-form").length, 1);
    });
  }
});

test("blank contact details do not erase a completed submission", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept(); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  await app.api.click(app.button("Accept")); await app.flush();
  assert.match(app.document.body.textContent, /Enter an email address or phone number/);
  assert.match(app.document.body.textContent, /Your ticket and consent are saved/);
  assert.equal(app.saves.filter(x => x.name === "contact").length, 0);
});

test("failed contact save keeps the receipt and retries only contact details", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept(); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  await app.edit("updates-email", "alex@example.test"); app.failContact(true);
  await app.api.click(app.button("Accept")); await app.flush();
  assert.match(app.document.body.textContent, /Your ticket and consent are saved/);
  assert.equal(app.field("updates-email").value, "alex@example.test");
  app.failContact(false); await app.api.click(app.button("Accept")); await app.flush();
  assert.match(app.document.body.textContent, /Updates enabled/);
  assert.equal(app.saves.filter(x => x.name === "prepare").length, 1);
});

test("failed upload retains the checkbox and retries the same prepared submission", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept(); app.failUpload(true);
  await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  assert.match(app.document.body.textContent, /upload did not finish/);
  assert.doesNotMatch(app.document.body.textContent, /Your ticket and consent are saved/);
  assert.equal(app.field("quick-consent").checked, true);
  app.failUpload(false); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  assert.equal(app.saves.filter(x => x.name === "prepare").length, 1);
  assert.match(app.document.body.textContent, /Your ticket and consent are saved/);
});

test("a lost preparation response retries with the same idempotency identity", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept(); app.failPrepare(true);
  await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  app.failPrepare(false); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  const attempts = app.saves.filter(x => x.name === "prepare");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].body.submissionId, attempts[1].body.submissionId);
  assert.equal(attempts[0].body.accessToken, attempts[1].body.accessToken);
});

test("failed consent never shows success and retry uses the same ticket", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept(); app.failConsent(true);
  await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  assert.doesNotMatch(app.document.body.textContent, /Success, Your ticket has been received/);
  assert.equal(app.field("quick-consent").checked, true);
  app.failConsent(false); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  assert.equal(app.saves.filter(x => x.name === "prepare").length, 1);
  assert.match(app.document.body.textContent, /Your ticket and consent are saved/);
});

test("replacing or removing a file requires fresh consent; cancelled and invalid choices keep it", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept();
  await app.choose(undefined); await app.choose(app.file("invalid.txt", "text/plain"));
  app.continueEnabled();
  await app.choose(app.file("replacement.png")); app.continueBlocked();
  assert.equal(app.field("quick-consent").checked, false);
  await app.accept(); await app.api.click(app.button("Remove")); app.continueBlocked();
  assert.equal(app.document.getElementById("quick-consent"), null);
});

test("cached and handoff consent never precheck the box", async t => {
  const app = await runtime(t, { initialPrefill: { ...completeTicket, consentGiven: true, digitalSignature: "Alex Example", sourceAssessmentId: "synthetic-source", sourceAssessmentAccessToken: "synthetic-source-token" } });
  assert.equal(app.field("quick-consent").checked, false); app.continueBlocked();
});

test("checkout reuses the completed upload after contact details and background extraction are ready", async t => {
  const app = await runtime(t); app.readyForPayment();
  await app.choose(app.file()); await app.accept(); await app.api.click(app.button("Submit ticket and consent")); await app.flush();
  await app.edit("updates-email", "alex@example.test"); await app.api.click(app.button("Accept")); await app.flush();
  assert.equal(app.document.getElementById("payment-terms"), null);
  await app.api.click(app.button("Continue to Stripe for $198.00 CAD plus GST")); await app.flush();
  assert.equal(app.saves.filter(x => x.name === "prepare").length, 1);
  assert.equal(app.saves.filter(x => x.name === "upload").length, 1);
  assert.equal(app.saves.filter(x => x.name === "generate-consent-form").length, 1);
  assert.equal(app.saves.find(x => x.name === "create-payment").body.formData.email, "alex@example.test");
  assert.match(app.document.body.textContent, /Your ticket and consent are saved/);
});

test("double clicking Submit cannot create simultaneous submissions", async t => {
  const app = await runtime(t);
  await app.choose(app.file()); await app.accept(); const submit = app.button("Submit ticket and consent");
  await app.api.act(async () => { submit.click(); submit.click(); }); await app.flush();
  assert.equal(app.saves.filter(x => x.name === "prepare").length, 1);
});
