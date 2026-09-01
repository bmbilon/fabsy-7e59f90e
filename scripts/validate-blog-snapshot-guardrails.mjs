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
  if (entry.name === 'alberta-traffic-trial-evidence-self-represented') {
    if (!candidate.content.includes('Disclosure must be requested and reviewed before trial')) {
      violations.push('evidence article is missing the reviewed disclosure heading');
    }
    if (!candidate.content.includes('The prosecutor and police do not act for you or give legal advice')) {
      violations.push('evidence article is missing the reviewed disclosure boundary');
    }
    if (!article?.querySelector('a[href="https://www.canlii.org/en/ca/scc/doc/1991/1991canlii45/1991canlii45.html"]')) {
      violations.push('evidence article is missing its Stinchcombe primary citation');
    }
    if (!candidate.content.includes('Independent help and court information') ||
        !article?.querySelector('a[href="https://www.alberta.ca/contact-court-and-justice-services"]')) {
      violations.push('evidence article is missing independent court-help information');
    }
    if (candidate.content.includes('interpreted without legal advice from the Crown or police')) {
      violations.push('evidence article retained the superseded disclosure heading');
    }
  }
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
