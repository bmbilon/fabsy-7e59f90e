// Run explicitly after reviewing landing-page changes and rendering current HTML.
// Never invoked automatically by the production build or validation tests.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { sourceFingerprints, mainFingerprint, schemaFingerprint } = require('./rapid-conversion-snapshot-guardrail.cjs');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'dist/_landing/rapid-resolution-alt/index.html'), 'utf8'));
fs.writeFileSync(path.join(__dirname, 'fixtures/rapid-conversion-fingerprint.json'), JSON.stringify({
  sources: sourceFingerprints(), main: mainFingerprint(dom.window.document.querySelector('main')),
  schemas: schemaFingerprint(dom.window.document),
}, null, 2) + '\n');
dom.window.close();
console.log('Updated the exact Rapid Resolution snapshot fixture. Review its source and screenshot changes together.');
