import assert from 'node:assert/strict';
import { stripCapturedTrackingScripts } from './snapshot-runtime-hygiene.mjs';

// The real capture's auid happened to contain a 555 telephone-shaped digit
// sequence. Keep that reproduction without storing its other browser data.
const conversion = '<script async="" src="https://googleads.g.doubleclick.net/pagead/viewthroughconversion/18419256057/?auid=1765557000.1788171171&amp;en=page_view"></script>';
const loader = '<script id="fabsy-google-tag" src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE"></script>';
const preservationCases = [
  '<main><p>Call (403) 555-0100.</p><a href="tel:+14035550100">Contact</a></main>',
  '<script type="application/ld+json">{"@type":"Organization","telephone":"+1-403-555-0100"}</script>',
  '<script type="module" src="/assets/index-example.js"></script>',
  '<script>window.example = "403-555-0100";</script>',
  '<script src="https://www.google.com/recaptcha/api.js"></script>',
  '<script src="https://www.googletagmanager.com.evil.test/gtag/js?id=G-EXAMPLE"></script>',
  '<script data-src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE"></script>',
  '<script src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE">window.example = "403-555-0100";</script>',
  '<p>auid=1765557000.1788171171 is printed content.</p>',
  '<a href="https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/?auid=1765557000.1788171171">An authored link remains.</a>',
];
for (const html of preservationCases) assert.equal(stripCapturedTrackingScripts(html), html);
const before = '<!doctype html><html><head>' + preservationCases.slice(1,4).join('\n') + '</head><body>' + preservationCases[0];
const after = '</body></html>';
assert.equal(stripCapturedTrackingScripts(before + conversion + loader + after), before + after,
  'Remove only recognized empty runtime scripts, preserving surrounding bytes');
assert.equal(stripCapturedTrackingScripts(conversion.replace('googleads.g.doubleclick.net', 'www.googleadservices.com')), '');
assert.equal(stripCapturedTrackingScripts(stripCapturedTrackingScripts(before + conversion + after)), before + after,
  'Snapshot hygiene is idempotent');
console.log('Snapshot runtime hygiene passed: captured Google tracking scripts removed; app scripts, JSON-LD, visible/tel phones and unknown providers preserved.');
