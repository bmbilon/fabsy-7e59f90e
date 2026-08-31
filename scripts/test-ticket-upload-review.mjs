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
        backend: "export const supabase = { functions: { invoke: (...args) => globalThis.__ticketReviewBackend.invoke(...args) } };",
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
      if (name !== "ocr-ticket") {
        forbidden.push(name);
        throw new Error(`Unexpected backend call: ${name}`);
      }
      assert.match(options.body.imageBase64, /^data:image\/(png|jpeg|webp);base64,/);
      return deferredRequest(requests, { name });
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
  return { window, document, api, requests, cacheRequests, flush, until, button, buttons, continueBlocked, continueEnabled, hiddenDetails, file, choose, waitForScan, finish, field, flagged, edit };
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
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  assert.equal(app.field("fineAmount").value, "200");
  app.continueEnabled();
});

test("partial OCR highlights missing details accessibly and clears the error after a correction", async t => {
  const app = await runtime(t);
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0, { ...completeTicket, fineAmount: null });
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
  assert.equal(app.field("ticketNumber").value, "");
  app.flagged("ticketNumber");
  await app.edit("ticketNumber", "SYNTHETIC-MANUAL-CORRECTION");
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-MANUAL-CORRECTION");
  app.continueBlocked();
});

test("an accepted replacement clears values from the earlier ticket, including manual corrections", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-first.png"));
  await app.waitForScan(1);
  await app.finish(0);
  await app.edit("fineAmount", "999.50");

  await app.choose(app.file("synthetic-second.png"));
  await app.waitForScan(2);
  app.hiddenDetails();
  app.continueBlocked();
  await app.finish(1, { ticketNumber: "SYNTHETIC-TICKET-B", issueDate: "2026-06-03", location: null, fineAmount: null });
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-TICKET-B");
  assert.equal(app.field("fineAmount").value, "");
  assert.equal(app.field("location").value, "");
  app.flagged("fineAmount");
  app.continueBlocked();
});

test("late results from replaced and removed scans cannot repopulate the current ticket", async t => {
  const app = await runtime(t);
  await app.choose(app.file("synthetic-old.png"));
  await app.waitForScan(1);
  await app.choose(app.file("synthetic-current.png"));
  await app.waitForScan(2);
  await app.finish(1, { ...completeTicket, ticketNumber: "SYNTHETIC-CURRENT" });
  await app.finish(0, { ...completeTicket, ticketNumber: "SYNTHETIC-STALE", fineAmount: "999" });
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-CURRENT");
  assert.equal(app.field("fineAmount").value, "200");

  await app.choose(app.file("synthetic-removed.png"));
  await app.waitForScan(3);
  await app.api.click(app.button("Remove"));
  app.hiddenDetails();
  await app.finish(2, { ...completeTicket, ticketNumber: "SYNTHETIC-REMOVED" });
  app.hiddenDetails();
  app.continueBlocked();
  assert.doesNotMatch(app.document.body.textContent, /SYNTHETIC-REMOVED/);
});

test("returning from the next step preserves the reviewed file and manual edits without rescanning", async t => {
  const app = await runtime(t);
  await app.choose(app.file());
  await app.waitForScan(1);
  await app.finish(0);
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
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  await app.choose(selected);
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  await app.choose(app.file("not-a-ticket.txt", "text/plain"));
  assert.equal(app.requests.length, 1);
  assert.equal(app.field("ticketNumber").value, completeTicket.ticketNumber);
  app.continueEnabled();
});

test("late cached data cannot replace a new ticket that the user uploaded and corrected", async t => {
  const app = await runtime(t, {}, { cacheKey: "synthetic-cache-key" });
  await app.until(() => app.cacheRequests.length === 1, "Expected the deferred cache lookup");
  await app.choose(app.file("synthetic-new-upload.png"));
  await app.waitForScan(1);
  await app.finish(0);
  await app.edit("ticketNumber", "SYNTHETIC-USER-CORRECTED");
  await app.api.act(async () => app.cacheRequests[0].resolve({ ticketData: { ...completeTicket, ticketNumber: "SYNTHETIC-OLD-CACHE", fineAmount: "888" } }));
  await app.flush();
  assert.equal(app.field("ticketNumber").value, "SYNTHETIC-USER-CORRECTED");
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
  app.continueEnabled();
  await app.api.click(app.field("vehicleSeized"));
  app.continueBlocked();
  assert.match(app.document.body.textContent, /Do not continue to checkout/);
});
