#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'ssg-pages');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY_REVIEWED_PAGES === '1';
const BANNED = /(?:no\s+win\s+no\s+fee|risk[\s-]*free|money\s+back|guarantee|zero[\s-]*risk)/i;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function canonicalFaq(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };
}

function loadReviewedPages() {
  const pages = [];
  for (const file of fs.readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.json')).sort()) {
    const page = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
    if (!String(page.hook || '').trim()) continue;
    const expectedSlug = path.basename(file, '.json');
    if (page.slug !== expectedSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) {
      throw new Error(`Invalid curated slug in ${file}.`);
    }
    if (!page.meta_title || page.meta_title.length > 60) throw new Error(`${page.slug}: invalid meta title.`);
    if (!page.meta_description || page.meta_description.length > 155) {
      throw new Error(`${page.slug}: invalid meta description.`);
    }
    if (!page.h1 || !page.what || !page.how || !page.next) {
      throw new Error(`${page.slug}: reviewed page is incomplete.`);
    }
    if (!Array.isArray(page.faqs) || !page.faqs.length) throw new Error(`${page.slug}: FAQs missing.`);
    const visibleText = JSON.stringify({
      meta_title: page.meta_title,
      meta_description: page.meta_description,
      h1: page.h1,
      hook: page.hook,
      bullets: page.bullets,
      what: page.what,
      how: page.how,
      next: page.next,
      faqs: page.faqs,
    });
    if (BANNED.test(visibleText) || visibleText.includes('—')) {
      throw new Error(`${page.slug}: reviewed page violates claim guardrails.`);
    }
    const storedSchema = typeof page.jsonld === 'string' ? JSON.parse(page.jsonld) : page.jsonld;
    if (JSON.stringify(storedSchema) !== JSON.stringify(canonicalFaq(page.faqs))) {
      throw new Error(`${page.slug}: FAQ schema does not match visible FAQs.`);
    }
    pages.push({
      slug: page.slug,
      meta_title: page.meta_title,
      meta_description: page.meta_description,
      h1: page.h1,
      hook: page.hook,
      bullets: Array.isArray(page.bullets) ? page.bullets : [],
      what: page.what,
      how: page.how,
      next: page.next,
      faqs: page.faqs,
      video: page.video || null,
      jsonld: typeof page.jsonld === 'string' ? page.jsonld : JSON.stringify(page.jsonld),
    });
  }
  if (!pages.length) throw new Error('No reviewed pages found.');
  return pages;
}

async function fetchExisting(slugs, select = '*') {
  const { data, error } = await supabase.from('page_content').select(select).in('slug', slugs);
  if (error) throw error;
  return data || [];
}

function writeBackup(rows, reviewedSlugs) {
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = process.env.REVIEWED_PAGES_BACKUP_PATH ||
    `/private/tmp/fabsy-page-content-backup-${safeTimestamp}.json`;
  const backup = {
    version: 1,
    createdAt: new Date().toISOString(),
    reviewedSlugs,
    existingRows: rows,
  };
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return backupPath;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}

async function main() {
  const pages = loadReviewedPages();
  const slugs = pages.map((page) => page.slug);
  const existing = await fetchExisting(slugs);
  const existingSlugs = new Set(existing.map((row) => row.slug));
  console.log(`Reviewed pages: ${pages.length}; updates: ${existing.length}; inserts: ${pages.length - existing.length}.`);
  for (const page of pages) console.log(` - ${existingSlugs.has(page.slug) ? 'update' : 'insert'} ${page.slug}`);

  if (!APPLY) {
    console.log('Dry run only. Set APPLY_REVIEWED_PAGES=1 to write these reviewed rows.');
    return;
  }

  const backupPath = writeBackup(existing, slugs);
  console.log(`Rollback backup written to ${backupPath}.`);
  const { error } = await supabase.from('page_content').upsert(pages, { onConflict: 'slug' });
  if (error) throw error;

  const verified = await fetchExisting(slugs, 'slug,meta_title,meta_description,h1,hook,bullets,what,how,next,faqs,video,jsonld');
  if (verified.length !== pages.length) {
    throw new Error(`Verification failed: expected ${pages.length} rows, found ${verified.length}.`);
  }
  const expected = new Map(pages.map((page) => [page.slug, page]));
  for (const row of verified) {
    const page = expected.get(row.slug);
    for (const field of Object.keys(page)) {
      if (JSON.stringify(stableJson(row[field])) !== JSON.stringify(stableJson(page[field]))) {
        throw new Error(`Verification failed for ${row.slug}.${field}.`);
      }
    }
  }
  console.log(`Reviewed page seed verified: ${verified.length} row(s).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
