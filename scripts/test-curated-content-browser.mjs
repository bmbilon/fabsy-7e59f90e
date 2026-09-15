#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.PRERENDER_BASE_URL || 'http://127.0.0.1:4173';
const SLUGS = ['speeding-ticket-alberta', 'fight-traffic-ticket-alberta', 'speeding-ticket-calgary', 'speeding-ticket-edmonton'];
const records = SLUGS.map((slug) => JSON.parse(fs.readFileSync(path.join(ROOT, 'ssg-pages', `${slug}.json`), 'utf8')));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const record of records) {
    const canonical = `https://fabsy.ca/content/${record.slug}`;
    await page.goto(new URL(`/content/${record.slug}`, BASE).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      (expected) => document.querySelector('h1')?.textContent?.trim() === expected,
      record.h1,
      { timeout: 30_000 },
    );
    await page.waitForSelector('script[data-article-schema]', { state: 'attached', timeout: 10_000 });

    assert.equal((await page.locator('h1').first().textContent())?.trim(), record.h1);
    assert.equal(await page.title(), record.meta_title);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonical);
    assert.match(await page.locator('main').innerText(), /General information, not legal advice/);
    const sourceDate = new Date(`${record.reviewed_at.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-CA', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
    assert.ok((await page.locator('main').innerText()).includes(`Sources checked ${sourceDate}`));

    if (/speeding-ticket-(?:calgary|edmonton)$/.test(record.slug)) {
      const city = record.slug.endsWith('calgary') ? 'Calgary' : 'Edmonton';
      assert.equal(await page.getByRole('heading', { name: `Where to find ${city} traffic court information`, exact: true }).count(), 1);
      assert.equal(await page.locator('article a[href="/hubs/alberta-tickets-101"]').count(), 1);
    }

    const sourceLinks = await page.locator('#official-sources-heading').locator('xpath=..').locator('li a').evaluateAll(
      (links) => links.map((link) => link.href),
    );
    assert.deepEqual(sourceLinks, record.sources.map((source) => source.url));

    const schema = JSON.parse(await page.locator('script[data-article-schema]').textContent());
    assert.equal(schema.headline, record.h1);
    assert.equal(schema.dateModified, record.reviewed_at);
    assert.equal(schema.author?.url, 'https://fabsy.ca/about');
    assert.deepEqual(schema.citation, record.sources.map((source) => source.url));
  }

  assert.deepEqual(pageErrors, []);

  // An unavailable content API must not replace bundled, reviewed guides with
  // an error page. Block the real API shape and exercise fresh navigations.
  const contentRequests = [];
  await page.route('**/rest/v1/page_content*', async route => {
    contentRequests.push(route.request().url());
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic content outage"}' });
  });
  for (const record of records) {
    await page.goto(new URL(`/content/${record.slug}`, BASE).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      expected => document.querySelector('h1')?.textContent?.trim() === expected,
      record.h1,
      { timeout: 10_000 },
    );
    assert.equal(await page.title(), record.meta_title);
    assert.equal(await page.locator('article').count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Page Not Found', exact: true }).count(), 0);
  }
  assert.deepEqual(contentRequests, [], 'Bundled guides should not request the content database');
  assert.deepEqual(pageErrors, []);
  console.log(`Curated content browser parity and content-API independence passed (${records.length} authority guides).`);
} finally {
  await browser?.close();
}
