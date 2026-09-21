#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url).pathname;
const bundle = async entry => (await build({ entryPoints: [`${root}${entry}`], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })).outputFiles[0].text;

test('all-source reducer classifies paid, organic, social, AI and direct without retaining identifiers', async () => {
  const module = { exports: {} };
  runInNewContext(await bundle('src/lib/trafficRequest.ts'), { module, URL });
  const metric = module.exports.trafficRequestMetric;
  const google = metric(new URL('https://fabsy.ca/content/speeding-ticket-calgary?gclid=PRIVATE_CLICK'), null, 'Mozilla/5.0 iPhone');
  assert.deepEqual(JSON.parse(JSON.stringify(google)), { page: '/content/speeding-ticket-calgary', channel: 'Paid search', source: 'Google', campaign: '', device: 'mobile' });
  assert.equal(JSON.stringify(google).includes('PRIVATE_CLICK'), false);
  const articleCampaign = metric(new URL('https://fabsy.ca/content/speeding-ticket-calgary?utm_source=google&utm_medium=cpc&utm_campaign=rr_google_profit_20260913'), null, 'Mozilla/5.0');
  assert.equal(articleCampaign.campaign, 'rr_google_profit_20260913');
  assert.equal(metric(new URL('https://fabsy.ca/blog'), 'https://www.google.ca/search?q=private', 'Mozilla/5.0').channel, 'Organic search');
  assert.equal(metric(new URL('https://fabsy.ca/'), 'https://chatgpt.com/c/private', 'Mozilla/5.0').channel, 'AI referral');
  assert.equal(metric(new URL('https://fabsy.ca/'), 'https://facebook.com/post/private', 'Mozilla/5.0').channel, 'Organic social');
  assert.equal(metric(new URL('https://fabsy.ca/rapid-resolution?fbclid=SHARE_CLICK'), 'https://facebook.com/post/private', 'Mozilla/5.0').channel, 'Organic social');
  assert.equal(metric(new URL('https://fabsy.ca/'), null, 'Mozilla/5.0').channel, 'Direct / unknown');
  assert.equal(metric(new URL('https://fabsy.ca/'), 'https://google.evil.com/path', 'Mozilla/5.0').channel, 'Referral');
  assert.equal(metric(new URL('https://fabsy.ca/admin/cases'), null, 'Mozilla/5.0'), null);
  assert.equal(metric(new URL('https://fabsy.ca/blog/123e4567-e89b-42d3-a456-426614174000'), null, 'Mozilla/5.0'), null);
});

test('consented live source distinguishes paid clicks from organic search', async () => {
  const module = { exports: {} };
  runInNewContext(await bundle('src/lib/live-view/core.ts'), { module, URL, URLSearchParams });
  const source = module.exports.visitorSource;
  assert.equal(source('https://www.google.ca/search?q=private'), 'Google');
  assert.equal(source('', '?gclid=PRIVATE_CLICK'), 'Google Ads');
  assert.equal(source('https://facebook.com/private', '?utm_source=meta&utm_medium=paid_social'), 'Meta Ads');
  assert.equal(source('', '?utm_medium=email&utm_source=newsletter'), 'Email');
});

test('edge counts eligible public HTML once and excludes privacy signals, bots and prefetch', async () => {
  const module = { exports: {} };
  const writes = [];
  runInNewContext(await bundle('functions/_middleware.ts'), {
    module, Request, Response, Headers, URL, TextEncoder, AbortSignal,
    fetch: async (url, init) => { writes.push({ url, body: JSON.parse(init.body) }); return new Response('true'); },
  });
  const invoke = async (path, headers = {}, status = 200) => {
    const background = [];
    await module.exports.onRequest({
      request: new Request(`https://fabsy.ca${path}`, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0', ...headers } }),
      env: { SUPABASE_SERVICE_ROLE_KEY: 'secret', ASSETS: { fetch: () => new Response(null, { status: 404 }) } },
      next: () => new Response('<!doctype html>', { status, headers: { 'Content-Type': 'text/html' } }),
      waitUntil: promise => background.push(promise),
    });
    await Promise.all(background);
  };
  await invoke('/content/speeding-ticket-calgary', { Referer: 'https://www.google.ca/search?q=SECRET' });
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0].body).sort(), ['p_campaign','p_channel','p_device','p_page','p_source']);
  assert.equal(writes[0].body.p_channel, 'Organic search');
  assert.equal(JSON.stringify(writes).includes('SECRET'), false);
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }, { Purpose: 'prefetch' }, { 'User-Agent': 'Googlebot' }]) await invoke('/blog', headers);
  await invoke('/admin/dashboard');
  await invoke('/blog', {}, 404);
  assert.equal(writes.length, 1);
});
