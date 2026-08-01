#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { articleViolations } from '../src/lib/published-content-guardrails-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.resolve(
  process.env.BLOG_SNAPSHOT_DIR || path.join(ROOT, 'public/prerendered/blog')
);

if (!fs.existsSync(BLOG_DIR)) {
  console.error(`Blog snapshot directory is missing: ${BLOG_DIR}`);
  process.exit(1);
}

const failures = [];
let checked = 0;

for (const entry of fs.readdirSync(BLOG_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const snapshot = path.join(BLOG_DIR, entry.name, 'index.html');
  if (!fs.existsSync(snapshot)) continue;

  const dom = new JSDOM(fs.readFileSync(snapshot, 'utf8'));
  const document = dom.window.document;
  const article = document.querySelector('article');
  const candidate = {
    title: document.querySelector('h1')?.textContent?.trim() || '',
    meta_description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    content: article?.querySelector('.prose')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  };
  const violations = articleViolations(candidate);
  if (violations.length) failures.push({ slug: entry.name, violations });
  checked += 1;
  dom.window.close();
}

if (checked === 0) {
  console.error(`No blog post snapshots found under ${BLOG_DIR}`);
  process.exit(1);
}

if (failures.length) {
  console.error(`Rendered blog guardrails failed for ${failures.length} of ${checked} snapshot(s):`);
  for (const failure of failures) {
    console.error(` - ${failure.slug}: ${failure.violations.join('; ')}`);
  }
  process.exit(1);
}

console.log(`Rendered blog guardrails valid for ${checked} snapshot(s).`);
