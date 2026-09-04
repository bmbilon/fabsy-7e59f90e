import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { MessageChannel } from "node:worker_threads";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

// Mount the real upload, OCR-review and wizard components against a synthetic
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
        backend: "export const supabase = { functions: { invoke: (...args) => globalThis.__ticketReviewBackend.invoke(...args) }, storage: { from: (...args) => globalThis.__ticketReviewBackend.storageFrom(...args) } };",
        locale: "const locale = { locale: 'en', setIntakeHandoff() {} }; export const useLocale = () => locale;",
        toast: "const value = { toast() {} }; export const useToast = () => value;",
        cache: "const value = { getCachedTicketData: (...args) => globalThis.__ticketReviewBackend.readCache(...args), isCacheKeyValid: () => true }; export const useTicketCache = () => value;",
        referral: `
          export const REFERRAL_ATTRIBUTION_EVENT = 'offline-referral';
          export const readActiveReferral = () => null;
          export const captureReferralFromLocation = async () => null;
          export const captureReferralCode = async () => null;
          export const clearReferralAttribution = () => {};
        `,
      };
      const boundaries = [
        [/integrations\/supabase\/client$/, "backend"],
        [/i18n\/locale-context$/, "locale"],
        [/hooks\/use-toast$/, "toast"],
        [/hooks\/useTicketCache$/, "cache"],
        [/lib\/referrals\/capture$/, "referral"],
      ];
      for (const [filter, path] of boundaries) {
        bundler.onResolve({ filter }, () => ({ path, namespace: "offline-review" }));
      }
      // These later screens are outside this flow's coverage. Keep the actual
      // wizard navigation mounted, including its Continue/Previous validation.
      bundler.onResolve({ filter: /(?:^|\/)(PersonalInfoStep|DefenseStep|ConsentStep|PaymentStep|ReviewStep|LocalizedTicketJourney|InstantTicketAnalyzer)$/ }, () => ({ path: "later-step", namespace: "offline-review" }));
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

async function runtime(t, props = {}, { cacheKey, resumeDraft = false, convertedDraft = false, unuploadedDraft = false, pendingUpload = false, deliveryStatus = "sent", deliveryChannel = "email", deliveryMode = "automatic", rotateOnSave = false, storageWriteFails = false } = {}) {
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
  const draftRequests = [];
  const uploadRequests = [];
  const cacheRequests = [];
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
  let draftRevision = 1;
  const draftToken = "a".repeat(64);
  const rotatedDraftToken = "b".repeat(64);
  const draftId = "550e8400-e29b-41d4-a716-446655440000";
  const resumeDelivery = (status = "pending", channel = null, mode = "automatic") => ({
    status,
    channel,
    sentAt: status === "sent" ? new Date().toISOString() : null,
    canRetry: status === "failed",
    mode,
  });
  const draftResponse = (extra = {}) => ({
    success: true, draftId, revision: draftRevision,
    contact: { email: "driver@example.test", phone: "" },
    albertaConfirmed: true, contactPermission: true, preferredLocale: "en",
    currentStep: 1, completedStep: 0, draftData: {},
    ticketDocumentPath: `${draftId}/representation-ticket-r1.png`,
    ticketUploadedAt: null, status: "active",
    hasPendingTicketUpload: false,
    resumeDelivery: resumeDelivery(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...extra,
  });
  window.__ticketReviewBackend = {
    invoke(name, options) {
      if (name === "ticket-intake-draft") {
        const action = options.body.action;
        draftRequests.push(options.body);
        if (action === "create") return Promise.resolve({ data: draftResponse({
          accessToken: draftToken,
          upload: { bucket: "assessment-tickets", path: `${draftId}/representation-ticket-r1.png`, token: "signed-upload", contentType: options.body.file.contentType, maxBytes: options.body.file.size },
        }), error: null });
        if (action === "prepare_upload") {
          draftRevision += 1;
          return Promise.resolve({ data: draftResponse({
            hasPendingTicketUpload: !unuploadedDraft,
            upload: { bucket: "assessment-tickets", path: `${draftId}/representation-ticket-r${draftRevision}.png`, token: "signed-retry-upload", contentType: options.body.file.contentType, maxBytes: options.body.file.size },
          }), error: null });
        }
        if (action === "confirm_upload") return Promise.resolve({ data: draftResponse({
          ticketUploadedAt: new Date().toISOString(),
          hasPendingTicketUpload: false,
          resumeDelivery: resumeDelivery(deliveryStatus, deliveryChannel, deliveryMode),
        }), error: null });
        if (action === "retry_delivery") return Promise.resolve({ data: draftResponse({
          ticketUploadedAt: new Date().toISOString(),
          resumeDelivery: resumeDelivery("sent", deliveryChannel),
        }), error: null });
        if (action === "read") return Promise.resolve({ data: draftResponse({
          contact: { email: "driver@example.test", phone: "4035550123" },
          draftData: { ...completeTicket, ticketType: "officer_issued", ticketTypeSource: "upload", email: "driver@example.test", phone: "4035550123" },
          ticketUploadedAt: unuploadedDraft ? null : new Date().toISOString(),
          hasPendingTicketUpload: pendingUpload,
          resumeDelivery: resumeDelivery(deliveryStatus, deliveryChannel, deliveryMode),
          ...(convertedDraft ? { status: "converted", currentStep: 6, completedStep: 5, convertedSubmissionId: draftId, clientId: "550e8400-e29b-41d4-a716-446655440001" } : {}),
        }), error: null });
        if (action === "save") {
          draftRevision += 1;
          return Promise.resolve({ data: draftResponse({
            currentStep: options.body.currentStep,
            completedStep: options.body.completedStep,
            draftData: options.body.draftData,
            ticketUploadedAt: unuploadedDraft ? null : new Date().toISOString(),
            ...(rotateOnSave ? { accessToken: rotatedDraftToken } : {}),
          }), error: null });
        }
        if (action === "discard_pending_upload") {
          draftRevision += 1;
          return Promise.resolve({ data: draftResponse({
            contact: { email: "driver@example.test", phone: "4035550123" },
            draftData: { ...completeTicket, ticketType: "officer_issued", ticketTypeSource: "upload", email: "driver@example.test", phone: "4035550123" },
            ticketUploadedAt: new Date().toISOString(),
            hasPendingTicketUpload: false,
            resumeDelivery: resumeDelivery(deliveryStatus, deliveryChannel, deliveryMode),
          }), error: null });
        }
        throw new Error(`Unexpected draft action: ${action}`);
      }
      if (name !== "ocr-ticket") throw new Error(`Unexpected backend call: ${name}`);
      assert.match(options.body.imageBase64, /^data:image\/(png|jpeg|webp);base64,/);
      return deferredRequest(requests, { name });
    },
    storageFrom(bucket) {
      assert.equal(bucket, "assessment-tickets");
      return { uploadToSignedUrl: async (path, token, file, options) => {
        uploadRequests.push({ path, token, file, options });
        return { data: { path }, error: null };
      } };
    },
    readCache(key) {
      return deferredRequest(cacheRequests, { key });
    },
  };
  if (cacheKey) window.localStorage.setItem("ticket-cache-key", cacheKey);
  if (resumeDraft) window.localStorage.setItem("fabsy.ticket-intake-capability.v1", JSON.stringify({
    draftId,
    accessToken: draftToken,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  }));
  if (storageWriteFails) {
    Object.defineProperty(Object.getPrototypeOf(window.localStorage), "setItem", {
      configurable: true,
      value() { throw new window.DOMException("Synthetic storage denial", "QuotaExceededError"); },
    });
  }
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
  const continueBlocked = () => {
    assert.ok(buttons("Continue").every(node => node.disabled), "Continue must stay unavailable until capture and required review are complete");
  };
  const continueEnabled = () => {
    assert.ok(buttons("Continue").length > 0, "A reviewed ticket should offer Continue");
    assert.ok(buttons("Continue").every(node => !node.disabled), "Both wizard navigation controls must permit a valid reviewed ticket");
  };
  const hiddenDetails = () => {
    assert.equal(document.getElementById("ticketNumber"), null, "Ticket fields must not appear before capture finishes");
    assert.equal(document.getElementById("pro-licence-class"), null, "Licence-class questions must wait for capture");
  };
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
  const flagged = id => {
    const node = field(id);
    assert.equal(node.getAttribute("aria-invalid"), "true", `${id} must expose its correction state to assistive technology`);
    assert.match(node.className, /(?:border|ring)-(?:destructive|red-\d+)/, `${id} needs a visible red correction border`);
    const hint = (node.getAttribute("aria-describedby") || "").split(/\s+/)
      .map(hintId => document.getElementById(hintId)?.textContent || "").join(" ");
    assert.match(hint, /read|enter|correct|missing/i, `${id} must have a linked correction message, not just a colored border`);
  };
  const edit = async (id, value) => {
    await api.changeText(field(id), value);
    await flush();
  };
  const saveLead = async () => {
    await edit("lead-email", "driver@example.test");
    await api.click(field("alberta-confirmed"));
    await api.click(field("contact-permission"));
    await api.click(button("Save ticket and review details"));
    await until(() => document.getElementById("ticketNumber"), "Expected ticket review after the minimum lead was saved");
  };
  return { window, document, api, requests, draftRequests, uploadRequests, cacheRequests, flush, until, button, buttons, continueBlocked, continueEnabled, hiddenDetails, file, choose, waitForScan, finish, field, flagged, edit, saveLead };
}

test("a fresh intake presents capture first and waits for the current OCR scan before showing details", async t => {
  const app = await runtime(t);
  app.hiddenDetails();
  app.continueBlocked();
  assert.ok(app.button("Take photo"));
  assert.equal(app.document.querySelector('input[type="radio"]'), null, "Ticket-type questions must wait until after capture");

  await app.choose(app.file());
  await app.waitForScan(1);
  app.hiddenDetails();
  app.continueBlocked();
  assert.match(app.document.body.textContent, /scanning/i);

  await app.finish(0);
  app.hiddenDetails();
  assert.ok(app.field("lead-email"), "Contact details are collected before the full ticket form");
  assert.match(app.document.body.textContent, /permission to send me a secure resume link/i);
  assert.match(app.document.body.textContent, /anyone with the link can open my saved intake/i);
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  assert.equal(app.field("fineAmount").value, "200");
  assert.equal(app.uploadRequests.length, 1, "The ticket is uploaded once through a signed private URL");
  assert.deepEqual(app.draftRequests.map(request => request.action).slice(0, 2), ["create", "confirm_upload"]);
  assert.match(app.document.body.textContent, /emailed your secure resume link/i);
  assert.ok(app.button("Copy resume link"), "A copy-link fallback remains available after delivery");
  app.continueEnabled();
});

test("disabled provider delivery presents a truthful manual copy fallback without a futile retry", async t => {
  const app = await runtime(t, {}, {
    deliveryStatus: "pending",
    deliveryChannel: null,
    deliveryMode: "manual",
  });
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  assert.match(app.document.body.textContent, /copy the secure resume link below so you can return/i);
  assert.ok(app.button("Copy resume link"));
  assert.equal(app.buttons("Retry sending").length, 0);
  assert.doesNotMatch(app.document.body.textContent, /could not send the secure resume link/i);
});

test("a blocked browser storage write keeps a newly created capability usable in memory", async t => {
  const app = await runtime(t, {}, { storageWriteFails: true });
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  assert.match(app.document.body.textContent, /could not remember your secure return access/i);
  assert.ok(app.button("Copy resume link"));
  await app.api.click(app.button("Continue"));
  assert.equal(app.draftRequests.at(-1)?.action, "save");
  assert.equal(app.draftRequests.at(-1)?.accessToken, "a".repeat(64));
});

test("a definite delivery failure stays visible, retryable and keeps the copy-link fallback", async t => {
  const app = await runtime(t, {}, { deliveryStatus: "failed", deliveryChannel: "email" });
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  assert.match(app.document.body.textContent, /could not send the secure resume link/i);
  assert.ok(app.button("Copy resume link"));
  await app.api.click(app.button("Retry sending"));
  await app.until(() => /emailed your secure resume link/i.test(app.document.body.textContent), "Expected a successful explicit delivery retry");
  assert.deepEqual(app.draftRequests.map(request => request.action), ["create", "confirm_upload", "retry_delivery"]);
  assert.equal(app.buttons("Retry sending").length, 0, "A sent link cannot be retried from the intake");
});

test("a refresh restores an uploaded intake from its local capability without requiring the File object", async t => {
  const app = await runtime(t, {}, { resumeDraft: true });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved draft to restore");
  assert.equal(app.requests.length, 0, "Restoring a saved ticket must not run OCR again");
  assert.equal(app.draftRequests[0]?.action, "read");
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  assert.equal(app.document.getElementById("lead-email"), null, "The minimum lead screen is complete after a verified upload");
  assert.match(app.document.body.textContent, /stored privately/i);
  app.continueEnabled();
});

test("a reload discards an unfinished replacement and restores the last confirmed ticket", async t => {
  const app = await runtime(t, {}, { resumeDraft: true, pendingUpload: true });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved ticket to restore");
  assert.deepEqual(
    app.draftRequests.map(request => request.action),
    ["read", "discard_pending_upload"],
  );
  assert.equal(app.buttons("Keep previous ticket").length, 0, "Successful automatic recovery clears the pending replacement");
  app.continueEnabled();
});

test("the browser adopts a capability rotated by a contact-saving response", async t => {
  const app = await runtime(t, {}, { resumeDraft: true, rotateOnSave: true });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved ticket to restore");
  await app.api.click(app.button("Continue"));
  await app.until(() => /Step 2 of 6/.test(app.document.body.textContent), "Expected the saved step to advance");
  const stored = JSON.parse(app.window.localStorage.getItem("fabsy.ticket-intake-capability.v1"));
  assert.equal(stored.accessToken, "b".repeat(64));
});

test("a rotated capability remains usable in memory when browser storage rejects it", async t => {
  const app = await runtime(t, {}, {
    resumeDraft: true,
    rotateOnSave: true,
    storageWriteFails: true,
  });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved ticket to restore");
  await app.api.click(app.button("Continue"));
  await app.until(() => /Step 2 of 6/.test(app.document.body.textContent), "Expected the saved step to advance");
  assert.match(app.document.body.textContent, /could not remember your secure return access/i);
  await app.api.click(app.button("Send resume link"));
  assert.equal(app.draftRequests.at(-1)?.action, "retry_delivery");
  assert.equal(app.draftRequests.at(-1)?.accessToken, "b".repeat(64));
});

test("a draft whose first upload failed can retry without losing its synchronized contact", async t => {
  const app = await runtime(t, {}, { resumeDraft: true, unuploadedDraft: true });
  await app.until(() => app.document.getElementById("lead-email"), "Expected the incomplete lead screen to restore");
  assert.equal(app.field("lead-email").value, "driver@example.test");
  await app.choose(app.file("synthetic-retry.png"));
  await app.waitForScan(1);
  await app.finish(0);
  await app.api.click(app.button("Save ticket and review details"));
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the retried private upload to finish");
  assert.deepEqual(app.draftRequests.map(request => request.action), ["read", "save", "prepare_upload", "confirm_upload"]);
  assert.equal(app.uploadRequests[0]?.token, "signed-retry-upload");
});

test("a converted intake resumes at fresh consent after a reload or canceled checkout", async t => {
  const app = await runtime(t, {}, { resumeDraft: true, convertedDraft: true });
  await app.until(() => /Step 4 of 6/.test(app.document.body.textContent), "Expected converted intake to return to consent");
  assert.deepEqual(app.draftRequests.map(request => request.action), ["read"], "Immutable converted drafts are not autosaved");
  assert.ok(app.buttons("Previous").every(node => node.disabled), "Recovery cannot edit fields already converted into the submission");
  assert.match(app.document.body.textContent, /Consent Form/);
});

test("partial OCR highlights missing details accessibly and clears the error after a correction", async t => {
  const app = await runtime(t);
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0, { ...completeTicket, fineAmount: null });
  await app.saveLead();
  app.flagged("fineAmount");
  app.continueBlocked();
  assert.equal(app.field("ticketNumber").getAttribute("aria-invalid"), "false");

  await app.edit("fineAmount", "240.50");
  assert.notEqual(app.field("fineAmount").getAttribute("aria-invalid"), "true");
  app.continueEnabled();

  await app.edit("fineAmount", "not a dollar amount");
  app.flagged("fineAmount");
  app.continueBlocked();
});

test("PDF capture opens manual review without attempting OCR", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-ticket.pdf", "application/pdf"));
  assert.equal(app.requests.length, 0);
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, "");
  app.flagged("ticketNumber");
  app.continueBlocked();
  assert.match(app.document.body.textContent, /manual/i);
});

test("an OCR failure preserves the selected file and opens a usable manual correction form", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-unreadable.png"));
  await app.waitForScan(1);
  await app.api.act(async () => app.requests[0].resolve({ data: null, error: new Error("Synthetic OCR failure") }));
  await app.flush();
  assert.match(app.document.body.textContent, /synthetic-unreadable\.png/);
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, "");
  app.flagged("ticketNumber");
  await app.edit("ticketNumber", "SYNTHETIC-MANUAL-CORRECTION");
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-MANUAL-CORRECTION");
  app.continueBlocked();
});

test("an accepted replacement before saving clears values from the earlier ticket", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-first.png"));
  await app.waitForScan(1);
  await app.finish(0);

  await app.choose(app.file("synthetic-second.png"));
  await app.waitForScan(2);
  app.hiddenDetails();
  app.continueBlocked();
  await app.finish(1, { ticketNumber: "SYNTHETIC-TICKET-B", issueDate: "2026-06-03", location: null, fineAmount: null });
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-TICKET-B");
  assert.equal(app.field("fineAmount").value, "");
  assert.equal(app.field("location").value, "");
  app.flagged("fineAmount");
  app.continueBlocked();
});

test("late results from a replaced scan cannot repopulate the current ticket", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-old.png"));
  await app.waitForScan(1);
  await app.choose(app.file("synthetic-current.png"));
  await app.waitForScan(2);
  await app.finish(1, { ...completeTicket, ticketNumber: "SYNTHETIC-CURRENT" });
  await app.finish(0, { ...completeTicket, ticketNumber: "SYNTHETIC-STALE", fineAmount: "999" });
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-CURRENT");
  assert.equal(app.field("fineAmount").value, "200");
});

test("returning from the next step preserves the reviewed file and manual edits without rescanning", async t => {
  const app = await runtime(t);
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  await app.edit("ticketNumber", "SYNTHETIC-REVIEWED");
  await app.edit("fineAmount", "315.25");
  app.continueEnabled();
  await app.api.click(app.button("Continue"));
  assert.match(app.document.body.textContent, /Step 2 of 6/);
  await app.api.click(app.button("Previous"));
  await app.flush();
  assert.equal(app.button("Previous").disabled, true, "Back should return to the first review step");
  assert.equal(app.requests.length, 1, "Back navigation must not create another OCR request");
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-REVIEWED");
  assert.equal(app.field("fineAmount").value, "315.25");
  app.continueEnabled();
});

test("canceling, repeating or rejecting a replacement retains the existing reviewed ticket", async t => {
  const app = await runtime(t);
  const selected = app.file();
  await app.choose(selected);
  await app.waitForScan(1);
  await app.finish(0);
  await app.choose(undefined);
  await app.choose(selected);
  await app.choose(app.file("not-a-ticket.txt", "text/plain"));
  assert.equal(app.requests.length, 1);
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  app.continueEnabled();
});

test("legacy remote-cache keys are discarded without a lookup", async t => {
  const app = await runtime(t, {}, { cacheKey: "synthetic-cache-key" });
  assert.equal(app.window.localStorage.getItem("ticket-cache-key"), null);
  assert.equal(app.cacheRequests.length, 0, "Retired cache keys must never trigger a remote request");
  await app.choose(app.file("synthetic-new-upload.png"));
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  assert.equal(app.field("fineAmount").value, "200");
  app.continueEnabled();
});

test("an invalid first attachment does not reveal review fields or enable Continue", async t => {
  const app = await runtime(t);
  await app.choose(app.file("unsupported-ticket.txt", "text/plain"));
  app.hiddenDetails();
  app.continueBlocked();
  assert.equal(app.requests.length, 0);
  assert.match(app.document.body.textContent, /not accepted/i);
});

test("photo radar review still requires the owner's answer after OCR completes", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-owner-notice.png"));
  await app.waitForScan(1);
  await app.finish(0, { ...completeTicket, ticketType: "photo_radar", offenceDate: "2026-05-28" });
  await app.saveLead();
  assert.match(app.document.body.textContent, /Was this vehicle registered to you on the offence date/);
  assert.equal(app.document.getElementById("vehicleSeized"), null);
  app.continueBlocked();
  const ownerAnswer = app.document.querySelector('input[type="radio"][value="yes"]');
  assert.ok(ownerAnswer, "The owner confirmation remains an explicit user choice");
  await app.api.click(ownerAnswer);
  app.continueEnabled();
});

test("a vehicle-seizure flag continues to block officer-ticket checkout", async t => {
  const app = await runtime(t);
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  app.continueEnabled();
  await app.api.click(app.field("vehicleSeized"));
  app.continueBlocked();
  assert.match(app.document.body.textContent, /Do not continue to checkout/);
});
