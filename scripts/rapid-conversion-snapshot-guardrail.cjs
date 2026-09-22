// Exact admission for this paid landing page. A changed clause, price, link,
// hidden element or source file fails closed until its fixture is reviewed.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sourceFiles = [
  'src/pages/RapidResolutionAlternate.tsx', 'src/components/RapidResolutionCta.tsx',
  'src/components/FeeRefundNotice.tsx', 'src/config/offers.json',
  'src/config/feeRefund.json',
  'src/content/client-testimonials.json', 'src/content/clientTestimonials.ts',
];
const hash = value => createHash('sha256').update(value).digest('hex');
function sourceFingerprints() {
  return Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
}
function mainFingerprint(main) {
  const clone = main.cloneNode(true);
  const doc = clone.ownerDocument;
  const comments = doc.createTreeWalker(clone, 128);
  const remove = [];
  while (comments.nextNode()) remove.push(comments.currentNode);
  remove.forEach(node => node.remove());
  // React generates IDs from the rendering root. Preserve their relationships,
  // allowing only the root-dependent token to vary between SSR consumers.
  const ids = new Map();
  const html = clone.outerHTML.replace(/:R[a-z0-9]+:/gi, value => {
    if (!ids.has(value)) ids.set(value, `:react-${ids.size}:`);
    return ids.get(value);
  });
  return hash(html);
}
function schemaFingerprint(document) {
  return hash([...document.querySelectorAll('.rapid-landing > script[type="application/ld+json"]')].map(node => node.outerHTML).join(''));
}
function redactRapidConversionSnapshot(document, route, issues) {
  if (route !== '/rapid-resolution-alt') return;
  const main = document.querySelector('.rapid-landing > main');
  if (!main) return;
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/rapid-conversion-fingerprint.json'), 'utf8'));
  if (JSON.stringify(fixture.sources) !== JSON.stringify(sourceFingerprints()) || mainFingerprint(main) !== fixture.main || schemaFingerprint(document) !== fixture.schemas) {
    issues.push('Rapid Resolution conversion page differs from its reviewed complete offer, refund and link contract');
    return;
  }
  main.textContent = '[exact source-bound Rapid Resolution conversion page]';
  for (const link of document.querySelectorAll('.rapid-landing > footer nav[aria-label="Legal"] a')) {
    if (link.textContent === 'Fee-refund guarantee' && !link.children.length &&
        link.getAttribute('href') === '/terms-of-service#fee-refund-guarantee' &&
        [...link.attributes].every(attribute => ['href', 'class'].includes(attribute.name))) {
      link.textContent = '[exact fee-refund terms link]';
    }
  }
}
module.exports = { sourceFingerprints, mainFingerprint, schemaFingerprint, redactRapidConversionSnapshot };
