// Explicit review step only; never called automatically by build or tests.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { sourceFingerprints, mainFingerprint, schemaFingerprint } = require('./rapid-conversion-snapshot-guardrail.cjs');
(async () => {
  const { renderRapidLanding } = await import('./render-rapid-landing.mjs');
  const root = path.resolve(__dirname, '..');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'rapid-fixtures-'));
  try {
    fs.copyFileSync(path.join(root, 'dist/index.html'), path.join(dist, 'index.html'));
    const mains = [];
    let schemas;
    for (const whatsappEnabled of [false, true]) {
      await renderRapidLanding(dist, { whatsappEnabled });
      const dom = new JSDOM(fs.readFileSync(path.join(dist, '_landing/rapid-resolution-alt/index.html'), 'utf8'));
      mains.push(mainFingerprint(dom.window.document.querySelector('main')));
      const schema = schemaFingerprint(dom.window.document);
      if (schemas && schemas !== schema) throw new Error('Provider flag must not change the offer schema');
      schemas = schema;
      dom.window.close();
    }
    fs.writeFileSync(path.join(__dirname, 'fixtures/rapid-conversion-fingerprint.json'), JSON.stringify({ sources: sourceFingerprints(), mains, schemas }, null, 2) + '\n');
    console.log('Reviewed exact alternate markup for both WhatsApp configurations.');
  } finally { fs.rmSync(dist, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
