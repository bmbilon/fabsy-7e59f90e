// Browser verification for anderhue.ca (run after `npm run build:anderhue`).
//
//   1. Public pages: layout, links, menu, N4 calculator, copy rules, metadata.
//   2. Client app: the /start uploader for all three practice areas and the
//      /files portal (link request, secure link, file view, uploads).
//   3. Staff workspace: sign-in and membership states, Today, boards, file
//      pages, stage changes with client email preview, documents, new files,
//      practice scoping of every query.
//
// Everything runs against fixtures. No real accounts, emails, membership
// changes or production file reads are made. The local server applies the
// same headers as vercel.json, so Content-Security-Policy violations fail.
//
// Options (environment):
//   ANDERHUE_OUT_DIR           build folder (default dist-anderhue)
//   ANDERHUE_QA_SCREENSHOTS    folder for screenshots of every state
//   AH_QA_FONTS_DIR            local woff2 copies of the Google Fonts (optional)
//   AH_QA_BROWSER              chromium (default), firefox, webkit, chrome, msedge
import { chromium, firefox, webkit } from 'playwright';
import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startAnderhueServer } from './anderhue-qa/serve.mjs';
import { runPublicChecks } from './anderhue-qa/public-checks.mjs';
import { launchChromium, runClientQa } from './anderhue-qa/client-fixtures.mjs';
import { runStaffQaFlow } from './anderhue-qa/staff-fixtures.mjs';

const buildDir = path.resolve(process.env.ANDERHUE_OUT_DIR || 'dist-anderhue');
if (!existsSync(path.join(buildDir, 'client.html')) || !existsSync(path.join(buildDir, 'portal.html'))) {
  console.error(`No AnderHue build in ${buildDir}. Run npm run build:anderhue first.`);
  process.exit(1);
}
const shots = process.env.ANDERHUE_QA_SCREENSHOTS ? path.resolve(process.env.ANDERHUE_QA_SCREENSHOTS) : null;
const fontsDir = process.env.AH_QA_FONTS_DIR || null;
const started = Date.now();
const engine = process.env.AH_QA_BROWSER || 'chromium';
const launchers = {
  chromium: () => launchChromium(),
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch(),
  chrome: () => chromium.launch({ channel: 'chrome' }),
  msedge: () => chromium.launch({ channel: 'msedge' }),
};
if (!launchers[engine]) throw new Error(`Unknown AH_QA_BROWSER: ${engine}`);
const browser = await launchers[engine]();
console.log(`Browser: ${engine} ${browser.version()}`);
const server = await startAnderhueServer(buildDir);
const log = message => console.log(`  ok  ${message}`);
try {
  console.log('Public pages');
  await runPublicChecks({ browser, origin: server.origin, buildDir, screenshotDir: shots && path.join(shots, 'public'), log });

  console.log('Client intake and file portal');
  const client = await runClientQa({
    browser, origin: server.origin, screenshotDir: shots && path.join(shots, 'client'),
    fixturesDir: mkdtempSync(path.join(os.tmpdir(), 'anderhue-qa-files-')),
    log,
  });

  console.log('Staff workspace');
  await runStaffQaFlow({ origin: server.origin, browser, screenshotDir: shots && path.join(shots, 'staff'), fontsDir, log: message => console.log(message) });

  console.log(`PASS: AnderHue public pages, client intake and portal, staff workspace (${Math.round((Date.now() - started) / 1000)}s${shots ? `, ${client.screenshots.length} client screenshots in ${shots}` : ''})`);
} finally {
  await browser.close();
  await server.close();
}
