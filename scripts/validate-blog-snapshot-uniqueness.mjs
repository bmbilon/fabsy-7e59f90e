#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const BLOG_ROOT = path.resolve(process.env.BLOG_SNAPSHOT_DIR || path.join(ROOT, 'public/prerendered/blog'));
const policies = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/seoRoutePolicies.json'), 'utf8'));
const excluded = new Set([...Object.keys(policies.redirects || {}), ...(policies.gone || [])]);
const hashes = new Map();

if (!fs.existsSync(BLOG_ROOT)) {
  console.log('Blog snapshot uniqueness check skipped: snapshot directory is absent.');
  process.exit(0);
}

for (const slug of fs.readdirSync(BLOG_ROOT).sort()) {
  const filename = path.join(BLOG_ROOT, slug, 'index.html');
  const publicPath = `/blog/${slug}`;
  if (!fs.existsSync(filename) || excluded.has(publicPath)) continue;

  const document = new JSDOM(fs.readFileSync(filename, 'utf8')).window.document;
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  if (!/^index\s*,\s*follow$/i.test(robots.trim())) continue;

  const article = (document.querySelector('.prose')?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!article) continue;
  const hash = crypto.createHash('sha256').update(article).digest('hex');
  const matches = hashes.get(hash) || [];
  matches.push(publicPath);
  hashes.set(hash, matches);
}

const duplicates = [...hashes.values()].filter((paths) => paths.length > 1);
if (duplicates.length > 0) {
  throw new Error(`Indexable blog snapshots contain duplicate article bodies:\n${duplicates.map((paths) => paths.join('\n')).join('\n\n')}`);
}

console.log(`Blog snapshot uniqueness check passed (${hashes.size} indexable article bodies).`);
