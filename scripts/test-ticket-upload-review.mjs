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
        locale: `export const useLocale = () => ({
          locale: globalThis.__ticketReviewLocale || 'en',
          basePath: '/submit-ticket',
          isReleased: true,
          href: path => path,
          setIntakeHandoff() {},
        });`,
        i18n: `export const useTranslation = () => ({ t: (key, options = {}) => ({
          'common.next': 'Continue',
          'common.back': 'Back',
          'common.loading': 'Saving…',
          'language.englishControls': 'The English terms control if the translation differs.',
        }[key] || options.defaultValue || key) });`,
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
        [/^react-i18next$/, "i18n"],
        [/hooks\/use-toast$/, "toast"],
        [/hooks\/useTicketCache$/, "cache"],
        [/lib\/referrals\/capture$/, "referral"],
      ];
      for (const [filter, path] of boundaries) {
        bundler.onResolve({ filter }, () => ({ path, namespace: "offline-review" }));
      }
      // These later screens are outside this flow's coverage. Keep the actual
      // wizard navigation mounted, including its Continue/Previous validation.
      bundler.onResolve({ filter: /(?:^|\/)(PersonalInfoStep|DefenseStep|ConsentStep|PaymentStep|ReviewStep|InstantTicketAnalyzer)$/ }, () => ({ path: "later-step", namespace: "offline-review" }));
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

async function runtime(t, props = {}, { cacheKey, resumeDraft = false, convertedDraft = false, unuploadedDraft = false, pendingUpload = false, deliveryStatus = "sent", deliveryChannel = "email", deliveryMode = "automatic", rotateOnSave = false, loseSaveResponseAfterCommit = false, deferRecoveryUntilReload = false, storageWriteFails = false, locale = "en" } = {}) {
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
  window.__ticketReviewLocale = locale;
  let draftRevision = 1;
  const draftToken = "a".repeat(64);
  let activeDraftToken = draftToken;
  let recoveryReadsBlocked = false;
  let saveCommitted = false;
  let serverCurrentStep = 1;
  let serverCompletedStep = 0;
  let serverDraftData = {
    ...completeTicket,
    ticketType: "officer_issued",
    ticketTypeSource: "upload",
    email: "driver@example.test",
    phone: "4035550123",
  };
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
    albertaConfirmed: true, contactPermission: true, preferredLocale: locale,
    currentStep: serverCurrentStep,
    completedStep: serverCompletedStep,
    draftData: serverDraftData,
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
        if (action === "read") {
          if (recoveryReadsBlocked || options.body.accessToken !== activeDraftToken) {
            return Promise.resolve({ data: null, error: new Error("Synthetic draft capability rejected") });
          }
          return Promise.resolve({ data: draftResponse({
          contact: { email: "driver@example.test", phone: "4035550123" },
          draftData: serverDraftData,
          ticketUploadedAt: unuploadedDraft ? null : new Date().toISOString(),
          hasPendingTicketUpload: pendingUpload,
          resumeDelivery: resumeDelivery(deliveryStatus, deliveryChannel, deliveryMode),
          ...(convertedDraft ? { status: "converted", currentStep: 6, completedStep: 5, convertedSubmissionId: draftId, clientId: "550e8400-e29b-41d4-a716-446655440001" } : {}),
          }), error: null });
        }
        if (action === "save") {
          assert.match(options.body.replacementAccessToken, /^[0-9a-f]{64}$/);
          assert.notEqual(options.body.replacementAccessToken, options.body.accessToken);
          if (!storageWriteFails) {
            const retained = JSON.parse(window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"));
            assert.equal(retained.oldAccessToken, options.body.accessToken, "the old capability stays active until save resolves");
            assert.equal(retained.candidateAccessToken, options.body.replacementAccessToken, "the recovery candidate is persisted before save");
            assert.equal(retained.revision, options.body.revision);
          }
          draftRevision += 1;
          serverCurrentStep = options.body.currentStep;
          serverCompletedStep = Math.max(serverCompletedStep, options.body.completedStep);
          serverDraftData = options.body.draftData;
          if (rotateOnSave) activeDraftToken = options.body.replacementAccessToken;
          saveCommitted = true;
          const result = { data: draftResponse({
            ticketUploadedAt: unuploadedDraft ? null : new Date().toISOString(),
            ...(rotateOnSave ? { capabilityRotated: true } : {}),
          }), error: null };
          if (loseSaveResponseAfterCommit) {
            recoveryReadsBlocked = deferRecoveryUntilReload;
            return Promise.resolve({ data: null, error: new Error("Synthetic response lost after commit") });
          }
          return Promise.resolve(result);
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
  const reloadAfterLostResponse = async () => {
    assert.equal(saveCommitted, true, "the synthetic save must commit before reload recovery");
    recoveryReadsBlocked = false;
    await api.unmount();
    await api.mount(props);
    await flush();
  };
  return { window, document, api, requests, draftRequests, uploadRequests, cacheRequests, flush, until, button, buttons, continueBlocked, continueEnabled, hiddenDetails, file, choose, waitForScan, finish, field, flagged, edit, saveLead, reloadAfterLostResponse, activeDraftToken: () => activeDraftToken };
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

for (const rotateOnSave of [false, true]) {
  test(`autosave stops after a saved response and uses the latest capability on the next edit (rotation ${rotateOnSave})`, async t => {
    const app = await runtime(t, {}, { resumeDraft: rotateOnSave, rotateOnSave });
    if (rotateOnSave) {
      await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved intake to restore");
    } else {
      await app.choose(app.file());
      await app.waitForScan(1);
      await app.finish(0);
      await app.saveLead();
    }
    const saves = () => app.draftRequests.filter(request => request.action === "save");
    // Flush React after each debounce interval: one long act() would defer the
    // response-triggered effect until its end and conceal a feedback loop.
    const debounce = async () => {
      await app.api.act(async () => { await new Promise(resolveTick => setTimeout(resolveTick, 750)); });
      await app.flush();
    };
    await debounce();
    assert.equal(saves().length, 1, "the initial saved/restored form may synchronize once");
    const firstSave = saves()[0];
    const expectedToken = rotateOnSave ? firstSave.replacementAccessToken : firstSave.accessToken;
    assert.equal(app.activeDraftToken(), expectedToken);
    assert.equal(JSON.parse(app.window.localStorage.getItem("fabsy.ticket-intake-capability.v1")).accessToken, expectedToken);
    assert.equal(app.window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"), null);
    for (let interval = 0; interval < 3; interval += 1) {
      await debounce();
      assert.equal(saves().length, 1, "a capability/expiry response must not trigger another unchanged save");
      app.continueEnabled();
    }

    await app.edit("fineAmount", "375");
    await debounce();
    assert.equal(saves().length, 2, "a genuine field edit must still autosave exactly once");
    assert.equal(saves()[1].draftData.fineAmount, "375");
    assert.equal(saves()[1].accessToken, expectedToken, "the next save must read the latest capability, including rotation");
    assert.equal(saves()[1].revision, firstSave.revision + 1);
    await debounce();
    assert.equal(saves().length, 2, "the edited save response must also become quiescent");
    app.continueEnabled();
  });
}

test("a released localized intake saves the lead and then autosaves later fields", async t => {
  const app = await runtime(t, {}, { locale: "es" });
  await app.choose(app.file("localized-ticket.pdf", "application/pdf"));
  await app.edit("localized-ticketNumber", "LOCALIZED-TEST-1");
  await app.edit("localized-issueDate", "2026-06-01");
  await app.edit("localized-location", "Calgary");
  await app.edit("localized-fineAmount", "198");
  await app.edit("localized-offenceDescription", "Synthetic offline fixture");
  await app.edit("lead-email", "localized@example.test");
  await app.api.click(app.field("alberta-confirmed"));
  await app.api.click(app.field("contact-permission"));

  assert.match(app.document.body.textContent, /English terms control/i,
    "localized lead confirmations remain explicitly identified as English controls");
  const englishControlsNotice = [...app.document.querySelectorAll('p')]
    .find(node => /English terms control/i.test(node.textContent));
  assert.ok(englishControlsNotice);
  assert.equal(englishControlsNotice.closest('[lang="en"]'), null,
    "the translated control notice must inherit the selected language, not be mislabeled as English");
  assert.equal(app.field("lead-email").closest('[lang]')?.getAttribute('lang'), 'en',
    "the untranslated lead consent fields must remain explicitly marked as English fallback content");
  await app.api.click(app.button("Continue"));
  await app.until(() => app.document.getElementById("localized-firstName"),
    "the localized journey should advance only after its private draft is saved");

  assert.deepEqual(app.draftRequests.slice(0, 2).map(request => request.action), ["create", "confirm_upload"]);
  assert.equal(app.draftRequests[0].preferredLocale, "es");
  assert.equal(app.draftRequests[0].albertaConfirmed, true);
  assert.equal(app.draftRequests[0].contactPermission, true);
  assert.equal(app.uploadRequests.length, 1);

  await app.edit("localized-firstName", "Prueba");
  await app.api.act(async () => { await new Promise(resolveTick => setTimeout(resolveTick, 750)); });
  await app.until(() => app.draftRequests.some(request => request.action === "save"),
    "later localized fields should autosave through the same private draft");
});

test("a released localized saved intake can replace the wrong ticket before continuing", async t => {
  const app = await runtime(t, {}, { locale: "es", resumeDraft: true });
  await app.until(() => app.document.getElementById("localized-ticketNumber"), "Expected the localized saved ticket to restore");
  assert.match(app.document.body.textContent, /replace the saved ticket/i);

  await app.choose(app.file("localized-replacement.pdf", "application/pdf"));
  assert.equal(app.field("localized-ticketNumber").value, "", "selecting a replacement clears values from the previous ticket");
  assert.ok(app.button("Save replacement ticket").disabled, "the replacement cannot save before required details are reviewed");

  await app.edit("localized-ticketNumber", "LOCALIZED-REPLACEMENT-1");
  await app.edit("localized-issueDate", "2026-06-02");
  await app.edit("localized-location", "Edmonton");
  await app.edit("localized-fineAmount", "250");
  await app.edit("localized-offenceDescription", "Synthetic replacement fixture");
  assert.equal(app.button("Save replacement ticket").disabled, false);
  await app.api.click(app.button("Save replacement ticket"));
  await app.until(
    () => app.draftRequests.filter(request => request.action === "confirm_upload").length === 1,
    "Expected the localized replacement upload to be confirmed",
  );
  assert.deepEqual(app.draftRequests.map(request => request.action).slice(-2), ["prepare_upload", "confirm_upload"]);
  assert.equal(app.buttons("Save replacement ticket").length, 0);
  assert.match(app.document.body.textContent, /stored privately and linked to this intake/i);
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
  const saveRequest = app.draftRequests.find(request => request.action === "save");
  assert.match(saveRequest.replacementAccessToken, /^[0-9a-f]{64}$/);
  assert.notEqual(saveRequest.replacementAccessToken, "a".repeat(64));
  const stored = JSON.parse(app.window.localStorage.getItem("fabsy.ticket-intake-capability.v1"));
  assert.equal(stored.accessToken, saveRequest.replacementAccessToken);
  assert.equal(app.activeDraftToken(), saveRequest.replacementAccessToken);
  assert.equal(app.window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"), null);
});

test("a committed rotation survives response loss and reload with the retained candidate", async t => {
  const app = await runtime(t, {}, {
    resumeDraft: true,
    rotateOnSave: true,
    loseSaveResponseAfterCommit: true,
    deferRecoveryUntilReload: true,
  });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved draft to restore");
  await app.api.click(app.button("Continue"));
  await app.until(
    () =>
      app.draftRequests.filter((request) => request.action === "read").length ===
      3,
    "Expected both in-tab recovery probes to fail before reload",
  );
  const saveRequest = app.draftRequests.find(request => request.action === "save");
  const retained = JSON.parse(app.window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"));
  assert.equal(retained.oldAccessToken, "a".repeat(64));
  assert.equal(retained.candidateAccessToken, saveRequest.replacementAccessToken);
  assert.equal(app.activeDraftToken(), retained.candidateAccessToken);

  const requestsBeforeReload = app.draftRequests.length;
  await app.reloadAfterLostResponse();
  await app.until(() => /Step 2 of 6/.test(app.document.body.textContent), "Expected candidate recovery to restore the committed step");
  const recoveryReads = app.draftRequests.slice(requestsBeforeReload).filter(request => request.action === "read");
  assert.deepEqual(
    recoveryReads.map(request => request.accessToken),
    [retained.oldAccessToken, retained.candidateAccessToken],
    "reload must prove the old capability is revoked before adopting the candidate",
  );
  const stored = JSON.parse(app.window.localStorage.getItem("fabsy.ticket-intake-capability.v1"));
  assert.equal(stored.accessToken, retained.candidateAccessToken);
  assert.equal(app.window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"), null);
});

test("a lost save response without rotation recovers with the still-active old capability", async t => {
  const app = await runtime(t, {}, {
    resumeDraft: true,
    loseSaveResponseAfterCommit: true,
  });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved draft to restore");
  await app.api.click(app.button("Continue"));
  await app.until(() => /Step 2 of 6/.test(app.document.body.textContent), "Expected old-capability recovery to confirm the committed save");
  const saveRequest = app.draftRequests.find(request => request.action === "save");
  const recoveryReads = app.draftRequests.filter(request => request.action === "read").slice(1);
  assert.equal(recoveryReads.length, 1);
  assert.equal(recoveryReads[0].accessToken, "a".repeat(64));
  assert.equal(app.activeDraftToken(), "a".repeat(64));
  assert.notEqual(saveRequest.replacementAccessToken, app.activeDraftToken());
  const candidateProbe = await app.window.__ticketReviewBackend.invoke("ticket-intake-draft", {
    body: { action: "read", draftId: saveRequest.draftId, accessToken: saveRequest.replacementAccessToken },
  });
  assert.ok(candidateProbe.error, "an unused candidate must never authenticate");
  assert.equal(app.window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"), null);
});

test("a response-loss-recovered capability remains usable when browser storage rejects it", async t => {
  const app = await runtime(t, {}, {
    resumeDraft: true,
    rotateOnSave: true,
    loseSaveResponseAfterCommit: true,
    deliveryStatus: "failed",
    deliveryChannel: "email",
    storageWriteFails: true,
  });
  await app.until(() => app.document.getElementById("ticketNumber"), "Expected the saved ticket to restore");
  await app.api.click(app.button("Continue"));
  await app.until(() => /Step 2 of 6/.test(app.document.body.textContent), "Expected the saved step to advance");
  assert.match(app.document.body.textContent, /could not remember your secure return access/i);
  const saveRequest = app.draftRequests.find(request => request.action === "save");
  await app.api.click(app.button("Retry sending"));
  assert.equal(app.draftRequests.at(-1)?.action, "retry_delivery");
  assert.equal(app.draftRequests.at(-1)?.accessToken, saveRequest.replacementAccessToken);
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
  app.window.localStorage.setItem("fabsy.ticket-intake-pending-rotation.v1", JSON.stringify({
    draftId: "550e8400-e29b-41d4-a716-446655440000",
    oldAccessToken: "a".repeat(64),
    candidateAccessToken: "b".repeat(64),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    revision: 1,
  }));
  await app.api.click(app.button("Start a new intake"));
  await app.until(() => app.buttons("Take photo").length > 0, "Expected a clean capture screen for another ticket");
  assert.equal(app.window.localStorage.getItem("fabsy.ticket-intake-capability.v1"), null);
  assert.equal(app.window.localStorage.getItem("fabsy.ticket-intake-pending-rotation.v1"), null);
  assert.doesNotMatch(app.document.body.textContent, /already has a checkout/i);
});

for (const deliveryStatus of ["pending", "failed"]) {
  test(`a converted intake cannot request a ${deliveryStatus} resume delivery`, async t => {
    const app = await runtime(t, {}, {
      resumeDraft: true,
      convertedDraft: true,
      deliveryStatus,
      deliveryChannel: deliveryStatus === "failed" ? "email" : null,
    });
    await app.until(
      () => /already has a checkout/i.test(app.document.body.textContent),
      "Expected converted checkout recovery",
    );
    assert.equal(app.buttons("Send resume link").length, 0);
    assert.equal(app.buttons("Retry sending").length, 0);
    assert.deepEqual(app.draftRequests.map(request => request.action), ["read"]);
  });
}

test("a saved lead can replace the wrong private ticket before continuing", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-wrong-ticket.png"));
  await app.waitForScan(1);
  await app.finish(0);
  await app.saveLead();
  assert.match(app.document.body.textContent, /choose a replacement only if the wrong ticket was uploaded/i);

  await app.choose(app.file("synthetic-correct-ticket.png"));
  await app.waitForScan(2);
  app.continueBlocked();
  await app.finish(1, { ...completeTicket, ticketNumber: "SYNTHETIC-CORRECT-TICKET", fineAmount: "315" });
  assert.ok(app.button("Save replacement ticket"));
  await app.api.click(app.button("Save replacement ticket"));
  await app.until(
    () => app.draftRequests.filter(request => request.action === "confirm_upload").length === 2,
    "Expected the replacement upload to be confirmed",
  );
  assert.equal(app.uploadRequests.length, 2);
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-CORRECT-TICKET");
  assert.equal(app.field("fineAmount").value, "315");
  assert.equal(app.buttons("Save replacement ticket").length, 0);
  app.continueEnabled();
});

test("lead contact validation is exposed to assistive technology", async t => {
  const app = await runtime(t);
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
  await app.edit("lead-email", "not-an-email");
  await app.edit("lead-phone", "123");
  assert.equal(app.field("lead-email").getAttribute("aria-invalid"), "true");
  assert.match(app.document.getElementById("lead-email-error").textContent, /complete email/i);
  assert.equal(app.field("lead-phone").getAttribute("aria-invalid"), "true");
  assert.match(app.document.getElementById("lead-phone-error").textContent, /seven digits/i);
  app.continueBlocked();
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
