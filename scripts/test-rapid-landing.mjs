import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { renderRapidLanding } from './render-rapid-landing.mjs';

const require = createRequire(import.meta.url);
const { publicSnapshotGuardrailIssues } = require('./validate-snapshot-guardrails.cjs');

// Actual page rendering and Cloudflare middleware; no network or configured DB.
test('Rapid Resolution serves a usable first paint before JavaScript, with safe fallback', async () => {
  const dist = await mkdtemp(path.join(tmpdir(), 'fabsy-rapid-html-'));
  try {
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><html><head><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div></body></html>');
    await renderRapidLanding(dist);
    const html = await readFile(path.join(dist, '_landing/rapid-resolution-alt/index.html'), 'utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    assert.equal(doc.querySelector('#root').dataset.rapidPrerender, 'true');
    assert.equal(doc.querySelector('h1').textContent, 'Fight your ticket.We do the work.');
    assert.equal(doc.querySelector('#rapid-hero-cta').getAttribute('href'), '/submit-ticket?ticket_type=officer_issued&lp=rapid-resolution-alt');
    assert.match(doc.querySelector('[data-rapid-first-view]').textContent, /\$207\.90 total/);
    assert.match(doc.querySelector('[data-rapid-first-view]').textContent, /Shared with permission/);
    assert.match(doc.querySelector('[data-rapid-first-view]').textContent, /Conditions apply/);
    assert.equal(doc.querySelector('script[type="module"]').getAttribute('src'), '/assets/app.js');
    assert.equal(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), '/assets/app.css');
    assert.equal(doc.querySelector('link[rel="canonical"]').href, 'https://fabsy.ca/rapid-resolution');
    assert.equal(doc.querySelector('meta[name=robots]').content, 'noindex, follow');
    assert.deepEqual(publicSnapshotGuardrailIssues(html, '/rapid-resolution-alt'), []);
    for (const mutate of [
      doc => { doc.querySelector('[data-rapid-price]').textContent = '$99 including GST'; },
      doc => { doc.querySelector('[data-fee-refund-notice]').remove(); },
      doc => { doc.querySelector('[data-rapid-refund-summary]').hidden = true; },
      doc => { doc.querySelector('#rapid-hero-cta').href = '/pay-now'; },
      doc => { doc.querySelector('main').insertAdjacentHTML('beforeend', '<p hidden>Guaranteed withdrawal.</p>'); },
    ]) {
      const changed = new JSDOM(html);
      mutate(changed.window.document);
      assert.ok(publicSnapshotGuardrailIssues(changed.serialize(), '/rapid-resolution-alt').length > 0, 'Altered offers must fail the exact page contract');
      changed.window.close();
    }
    dom.window.close();
    const compiled = await build({ entryPoints: ['functions/_middleware.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
    const module = { exports: {} };
    runInNewContext(compiled.outputFiles[0].text, { module, Request, Response, Headers, URL, TextEncoder, AbortSignal, fetch: () => { throw new Error('Network disabled'); } });
    const assetRequests = [];
    const background = [];
    let nextCalls = 0;
    const invoke = (pathname, method = 'GET', assetHtml = html, agent = 'Mozilla/5.0') => module.exports.onRequest({
      request: new Request(`https://fabsy.ca${pathname}`, { method, headers: { 'User-Agent': agent, Accept: 'text/html' } }),
      env: { TRAFFIC_MEASUREMENT_ENABLED: "false", PRECONSENT_MEASUREMENT_ENABLED: "false", ASSETS: { fetch: url => { assetRequests.push(String(url)); return new Response(assetHtml, { headers: { 'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex, follow' } }); } } },
      next: () => { nextCalls++; return new Response('SPA fallback'); },
      waitUntil: promise => background.push(promise),
    });
    const response = await invoke('/rapid-resolution-alt?gclid=PRIVATE&lp=untrusted');
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
    assert.equal(response.headers.get('X-Prerendered'), 'true');
    assert.deepEqual(assetRequests, ['https://fabsy.ca/_landing/rapid-resolution-alt/']);
    assert.equal(await (await invoke('/rapid-resolution-alt', 'HEAD')).text(), '');
    assert.equal(await (await invoke('/rapid-resolution-alt', 'GET', html, 'Googlebot')).text(), html);
    const fallback = await invoke('/rapid-resolution-alt', 'GET', '<html>SPA fallback</html>');
    assert.equal(fallback.headers.get('X-Robots-Tag'), 'noindex, follow');
    assert.equal(await fallback.text(), 'SPA fallback');
    assert.equal(await (await invoke('/rapid-resolution-alt', 'GET', html.replaceAll('https://fabsy.ca/rapid-resolution', 'https://fabsy.ca/wrong-page'))).text(), 'SPA fallback');
    assert.equal(await (await invoke('/rapid-resolution-alt', 'POST')).text(), 'SPA fallback');
    assert.equal(await (await invoke('/submit-ticket')).text(), 'SPA fallback');
    assert.equal(await (await invoke('/rapid-resolution')).text(), 'SPA fallback');
    assert.equal(nextCalls, 5);
    await Promise.all(background);
  } finally { await rm(dist, { recursive: true, force: true }); }
});
