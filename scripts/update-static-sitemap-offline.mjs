#!/usr/bin/env node
/** Rebuild only sitemap-pages.xml from registered static routes and its existing published blog inventory. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.resolve(process.env.SITEMAP_PUBLIC_DIR || path.join(ROOT, 'public'));
const target = path.join(PUBLIC_DIR, 'sitemaps/sitemap-pages.xml');
const previous = fs.readFileSync(target, 'utf8');

function entries(xml) {
  const document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  if (document.documentElement.localName !== 'urlset') throw new Error('Expected an existing URL sitemap.');
  return Array.from(document.getElementsByTagNameNS('*', 'url')).map(node => {
    const loc = node.getElementsByTagNameNS('*', 'loc')[0]?.textContent;
    if (!loc) throw new Error('A sitemap entry has no location.');
    const url = new URL(loc);
    if (url.origin !== 'https://fabsy.ca' || url.search || url.hash) throw new Error('Unexpected sitemap URL.');
    return { loc, slug: url.pathname.startsWith('/blog/') ? url.pathname.slice(6) : null, lastmod: node.getElementsByTagNameNS('*', 'lastmod')[0]?.textContent || undefined };
  });
}

const oldEntries = entries(previous);
if (!oldEntries.some(entry => entry.loc === 'https://fabsy.ca/')) throw new Error('Existing sitemap is missing the homepage.');
const blogPosts = oldEntries.filter(entry => entry.slug).map(entry => ({ slug: entry.slug, status: 'published', published_at: entry.lastmod }));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-offline-static-sitemap-'));
try {
  const blogCache = path.join(temporary, 'published-blogs.json');
  const output = path.join(temporary, 'public');
  fs.writeFileSync(blogCache, JSON.stringify(blogPosts), 'utf8');
  // An explicit local cache bypasses the generator's remote blog lookup.
  // Every generated sitemap is isolated; only the static/blog page file below
  // is copied back after proving no previous location or blog date was lost.
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/generate-sitemap-from-db.js')], {
    cwd: ROOT,
    env: { ...process.env, SITEMAP_PUBLIC_DIR: output, SITEMAP_BLOG_CACHE: blogCache },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Offline sitemap generation failed.');
  const next = fs.readFileSync(path.join(output, 'sitemaps/sitemap-pages.xml'), 'utf8');
  const nextEntries = entries(next);
  const byLocation = new Map(nextEntries.map(entry => [entry.loc, entry]));
  if (byLocation.size !== nextEntries.length) throw new Error('Generated sitemap contains duplicate locations.');
  for (const entry of oldEntries) {
    const replacement = byLocation.get(entry.loc);
    if (!replacement || (entry.slug && replacement.lastmod !== entry.lastmod)) {
      throw new Error(`Offline generation would remove or change existing inventory: ${entry.loc}`);
    }
  }
  if (process.argv.includes('--check')) {
    if (next !== previous) throw new Error('Static sitemap is stale. Run node scripts/update-static-sitemap-offline.mjs.');
    console.log('Static sitemap matches the local registry and existing published blog inventory.');
  } else {
    fs.writeFileSync(target, next, 'utf8');
    console.log(`Updated ${target}: ${nextEntries.length} URLs; preserved ${blogPosts.length} published blog entries. No remote lookup or other sitemap writes.`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
