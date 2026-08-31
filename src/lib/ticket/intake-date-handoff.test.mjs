import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

// Exercise the mounted form's initializer, asynchronous hydration and real state
// updater. Child rendering and all network services are isolated test fixtures.
process.env.TZ = "America/Edmonton";
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-intake-dates-"));
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://fabsy.test/submit-ticket", pretendToBeVisual: true });
for (const key of ["window", "document", "DocumentFragment", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent", "File", "FileReader", "MutationObserver", "HTMLInputElement", "localStorage"]) {
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = () => {};
const originalLog = console.log;
console.log = (...args) => { if (!String(args[0]).startsWith("[TicketForm]")) originalLog(...args); };

try {
  const outfile = path.join(temporary, "TicketForm.mjs");
  const mocks = {
    "@/i18n/locale-context": `export const useLocale = () => ({ locale: "en", setIntakeHandoff: globalThis.__intakeDateTest.setIntakeHandoff });`,
    "@/hooks/use-toast": `export const useToast = () => ({ toast: globalThis.__intakeDateTest.toast });`,
    "@/hooks/useTicketCache": `export const useTicketCache = () => ({ getCachedTicketData: globalThis.__intakeDateTest.getCachedTicketData, isCacheKeyValid: globalThis.__intakeDateTest.isCacheKeyValid });`,
    "@/lib/referrals/capture": `export const readActiveReferral = () => null; export const captureReferralFromLocation = async () => null; export const captureReferralCode = async () => null; export const clearReferralAttribution = () => {}; export const REFERRAL_ATTRIBUTION_EVENT = "test-referral-event";`,
    "./form-steps/TicketDetailsStep": `export default function TicketDetailsStep(props) { globalThis.__intakeDateTest.details = props; return null; }`,
    ...Object.fromEntries(["PersonalInfoStep", "DefenseStep", "ConsentStep", "PaymentStep", "ReviewStep"].map(name => [`./form-steps/${name}`, "export default function TestStep() { return null; }"])),
    "./LocalizedTicketJourney": "export default function TestLocalizedStep() { return null; }",
  };
  await build({
    entryPoints: [fileURLToPath(new URL("../../components/TicketForm.tsx", import.meta.url))],
    bundle: true, platform: "node", format: "esm", jsx: "automatic", outfile, logLevel: "silent",
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: "isolated-intake-services", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "intake-test" };
        if (/^(react|react-dom|react-router-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: "intake-test" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { MemoryRouter } = await import("react-router-dom");
  const { default: TicketForm } = await import(pathToFileURL(outfile).href);
  const day = date => date && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const mount = async (props = {}, fixture = {}) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(fixture.storage || {})) localStorage.setItem(key, value);
    const test = {
      cacheCalls: 0, details: null, handoff: null, toast: () => {}, isCacheKeyValid: () => true,
      getCachedTicketData: async () => { test.cacheCalls += 1; return fixture.cacheResult ?? null; },
      setIntakeHandoff: value => { test.handoff = value; },
    };
    globalThis.__intakeDateTest = test;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(TicketForm, props))));
    return {
      test, container,
      update: async values => act(async () => test.details.updateFormData(values)),
      close: async () => { await act(async () => root.unmount()); container.remove(); },
    };
  };

  for (const raw of [
    { ticketType: "photo_radar", issueDate: "2026-08-25", offenceDate: "2026-08-02" },
    { noticeType: "Photo radar notice", issueDate: "2026-08-25", offense_date: "2026-08-02" },
  ]) {
    const view = await mount({ initialPrefill: raw });
    assert.equal(view.test.details.formData.ticketType, "photo_radar");
    assert.equal(day(view.test.details.formData.issueDate), "2026-08-02", "Resolve the product before mapping a raw prefill date");
    await view.close();
  }
  const noOffenceDate = await mount({ initialPrefill: { ticketType: "photo_radar", issueDate: "2026-08-25" } });
  assert.equal(noOffenceDate.test.details.formData.issueDate, undefined, "A camera notice's issue date must not stand in for its offence date");
  assert.ok(noOffenceDate.container.textContent.includes("Offence date"), "The missing-field hint names the required camera date");
  await noOffenceDate.close();

  for (const key of ["eligibility-ocr-data", "eligibility-ocr-data-backup"]) {
    const view = await mount({}, { storage: { [key]: JSON.stringify({ ticket_type: "photo_radar", issueDate: "2026-08-25", offence_date: "2026-08-02" }) } });
    assert.equal(view.test.details.formData.ticketType, "photo_radar");
    assert.equal(day(view.test.details.formData.issueDate), "2026-08-02", `${key} uses the explicit offence date`);
    await view.close();
  }

  const explicitCamera = await mount({ initialTicketType: "photo_radar" }, { storage: {
    "eligibility-ocr-data": JSON.stringify({ ticketType: "officer_issued", issueDate: "2026-08-25" }),
    "ticket-cache-key": "old-cache-fixture",
  } });
  assert.equal(explicitCamera.test.details.formData.ticketType, "photo_radar", "A product link must win over an old unrelated cache");
  assert.equal(explicitCamera.test.details.formData.issueDate, undefined);
  assert.equal(explicitCamera.test.cacheCalls, 0);
  await explicitCamera.close();

  for (const manualDate of [new Date(2026, 7, 3, 12), undefined]) {
    let releaseCache;
    const cacheResult = new Promise(resolve => { releaseCache = resolve; });
    const view = await mount({}, { storage: { "ticket-cache-key": "delayed-cache-fixture" }, cacheResult });
    assert.equal(view.test.cacheCalls, 1);
    await view.update({ ticketType: "photo_radar", ticketTypeSource: "manual" });
    await view.update({ issueDate: manualDate });
    await act(async () => releaseCache({ ticketData: { ticketType: "officer_issued", issueDate: "2026-08-25", offenceDate: "2026-08-02" } }));
    assert.equal(view.test.details.formData.ticketType, "photo_radar");
    assert.equal(day(view.test.details.formData.issueDate), day(manualDate), "Late cache hydration preserves manual edits and explicit clears");
    await view.update(() => ({ ticketType: "photo_radar", ticketTypeSource: "upload", issueDate: new Date(2026, 7, 4, 12) }));
    assert.equal(day(view.test.details.formData.issueDate), day(manualDate), "A delayed OCR child cannot overwrite an edited or cleared date");
    const handoff = view.test.handoff.prefillTicketData;
    assert.equal(handoff.offenceDate, day(manualDate) ?? "", "A locale handoff carries an explicit offence date");
    assert.equal(handoff.ticketDateManuallyEdited, true);
    await view.close();
    const resumed = await mount({ initialPrefill: handoff });
    assert.equal(day(resumed.test.details.formData.issueDate), day(manualDate), "The date and explicit-clear guard survive a remount");
    await resumed.update(current => ({ ...current, ticketImage: new File(["fixture"], "new-ticket.jpg", { type: "image/jpeg" }), issueDate: undefined }));
    assert.equal(resumed.test.details.formData.ticketDateManuallyEdited, false, "A new ticket resets the previous date's edit guard");
    await resumed.update(() => ({ issueDate: new Date(2026, 7, 5, 12) }));
    assert.equal(day(resumed.test.details.formData.issueDate), "2026-08-05");
    await resumed.close();
  }

  const officer = await mount({ initialPrefill: { ticketType: "officer_issued", issueDate: "2026-08-25" } });
  assert.equal(day(officer.test.details.formData.issueDate), "2026-08-25", "Date-only strings must not shift to the prior Alberta calendar day");
  await officer.close();
  console.log("Intake date handoff tests passed (raw dates, all caches, product routing, manual corrections/clears, late OCR, locale remount and new-ticket reset).");
} finally {
  console.log = originalLog;
  dom.window.close();
  delete globalThis.__intakeDateTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
