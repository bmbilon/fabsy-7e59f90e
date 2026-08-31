import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "fabsy-resolution-action-"));
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://fabsy.test/admin", pretendToBeVisual: true });
for (const key of ["window", "document", "DocumentFragment", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent", "MutationObserver", "HTMLInputElement"]) globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("External networking is forbidden in resolution email tests"); };

try {
  const outfile = path.join(temporary, "ResolutionEmailAction.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../../components/ResolutionEmailAction.tsx", import.meta.url))],
    bundle: true, platform: "node", format: "esm", jsx: "automatic", outfile, logLevel: "silent",
    banner: { js: "import { createRequire as createTestRequire } from 'node:module'; const require = createTestRequire(import.meta.url);" },
    plugins: [{ name: "no-live-email", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.path === "@/integrations/supabase/client") return { path: args.path, namespace: "resolution-test" };
        if (/^(react|react-dom)(\/|$)/.test(args.path)) return { path: require.resolve(args.path), external: true };
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: "resolution-test" }, () => ({ contents: "export const supabase = { functions: { invoke: (name, options) => globalThis.__resolutionActionTest.invoke(name, options) } };", loader: "js" }));
    } }],
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { ResolutionEmailAction } = await import(pathToFileURL(outfile).href);
  const preview = {
    fingerprint: "a".repeat(64), recipient: "fixture@example.test", subject: "Case result fixture", mainCopy: "The saved result is reduced.",
    referralInvitation: "Know a driver? Referral invitation fixture.", referralTerms: "$50 officer; $20 camera; terms fixture.", invitationAvailable: true, invitationUnavailableReason: null,
  };
  const mount = async ({ outcomeSaved = true, invitationAvailable = true, delayPreview = null } = {}) => {
    const calls = [];
    globalThis.__resolutionActionTest = { invoke: async (name, { body }) => {
      calls.push({ name, body });
      if (body.preview && delayPreview) await delayPreview;
      return { error: null, data: body.preview ? { success: true, preview: { ...preview, invitationAvailable } } : { success: true } };
    } };
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const render = async props => act(async () => root.render(createElement(ResolutionEmailAction, { submissionId: "case-fixture", outcomeSaved, ...props })));
    await render();
    return { calls, container, render, close: async () => { await act(async () => root.unmount()); container.remove(); } };
  };
  const button = (view, text) => [...view.container.querySelectorAll("button")].find(node => node.textContent.includes(text));
  const checkbox = (view, suffix) => view.container.querySelector(`[id$="-${suffix}"][role="checkbox"]`);
  const click = async node => { assert.ok(node, "Expected control missing"); await act(async () => node.click()); };

  const unsaved = await mount({ outcomeSaved: false });
  assert.equal(unsaved.calls.length, 0, "Mount must never prepare or send email");
  assert.equal(button(unsaved, "Review resolution").disabled, true);
  await click(button(unsaved, "Review resolution"));
  assert.equal(unsaved.calls.length, 0, "Unsaved outcomes cannot request a preview");
  await unsaved.close();

  for (const invitationAvailable of [true, false]) {
    const view = await mount({ invitationAvailable });
    assert.equal(view.calls.length, 0);
    await click(button(view, "Review resolution"));
    assert.equal(view.calls.length, 1);
    assert.equal(view.calls[0].body.preview, true);
    assert.equal(view.calls[0].body.includeReferralInvite, false);
    assert.equal(view.calls[0].body.referralConsentConfirmed, false);
    assert.equal(button(view, "Send reviewed").disabled, true, "Preview must not imply permission to send");
    assert.equal(checkbox(view, "reviewed").getAttribute("data-state"), "unchecked");
    if (invitationAvailable) assert.equal(checkbox(view, "referral").getAttribute("data-state"), "unchecked", "Invitations default off");
    else assert.equal(checkbox(view, "referral"), null);
    await click(button(view, "Send reviewed"));
    assert.equal(view.calls.length, 1, "An unreviewed preview cannot send");
    await click(checkbox(view, "reviewed"));
    await click(button(view, "Send reviewed"));
    assert.equal(view.calls.length, 2);
    assert.deepEqual(view.calls[1].body, { submissionId: "case-fixture", event: "case_resolved", preview: false, previewFingerprint: preview.fingerprint, includeReferralInvite: false, referralConsentConfirmed: false });
    assert.ok(view.container.textContent.includes("Delivery is not guaranteed"));
    await view.close();
  }

  const optedIn = await mount();
  await click(button(optedIn, "Review resolution"));
  await click(checkbox(optedIn, "reviewed"));
  await click(checkbox(optedIn, "referral"));
  assert.equal(checkbox(optedIn, "reviewed").getAttribute("data-state"), "unchecked", "Adding marketing copy requires another review");
  assert.equal(button(optedIn, "Send reviewed").disabled, true);
  assert.ok(optedIn.container.textContent.includes(preview.referralInvitation));
  await click(checkbox(optedIn, "reviewed"));
  await click(button(optedIn, "Send reviewed"));
  assert.equal(optedIn.calls[1].body.includeReferralInvite, true);
  assert.equal(optedIn.calls[1].body.referralConsentConfirmed, true);
  await optedIn.close();

  const cancel = await mount();
  await click(button(cancel, "Review resolution"));
  await click(checkbox(cancel, "reviewed"));
  await click(button(cancel, "Cancel"));
  assert.equal(cancel.calls.length, 1, "Cancel never sends");
  await click(button(cancel, "Review resolution"));
  assert.equal(checkbox(cancel, "reviewed").getAttribute("data-state"), "unchecked");
  assert.equal(checkbox(cancel, "referral").getAttribute("data-state"), "unchecked");
  await cancel.render({ submissionId: "different-case-fixture" });
  assert.equal(button(cancel, "Send reviewed"), undefined, "Changing cases clears review authorization");
  assert.equal(cancel.calls.filter(call => !call.body.preview).length, 0);
  await cancel.close();

  let release;
  const delayed = await mount({ delayPreview: new Promise(resolve => { release = resolve; }) });
  await click(button(delayed, "Review resolution"));
  await delayed.render({ submissionId: "new-case-fixture" });
  await act(async () => release());
  assert.equal(button(delayed, "Send reviewed"), undefined, "A late preview cannot authorize another case");
  assert.equal(delayed.calls.filter(call => !call.body.preview).length, 0);
  await delayed.close();
  console.log("Resolution email UI: no mount/preview send, saved-outcome gate, explicit review, invitation consent/default-off, preview fingerprint, cancellation and stale-case protection passed. No live calls.");
} finally {
  globalThis.fetch = originalFetch;
  dom.window.close();
  delete globalThis.__resolutionActionTest;
  await fs.rm(temporary, { recursive: true, force: true });
}
