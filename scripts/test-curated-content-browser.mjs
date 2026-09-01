#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.PRERENDER_BASE_URL || 'http://127.0.0.1:4173';
const SLUGS = ['speeding-ticket-alberta', 'fight-traffic-ticket-alberta'];
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
    assert.match(await page.locator('main').innerText(), /Reviewed August 31, 2026/i);

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
  console.log(`Curated content browser parity passed (${records.length} authority guides).`);
} finally {
  await browser?.close();
}
