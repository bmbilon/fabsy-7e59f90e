/**
 * Fetch every page_content row from Supabase and write it to src/content/pages.
 *
 * The Supabase REST API caps a single response, so this script deliberately
 * paginates and verifies the exact row count before replacing the local cache.
 * Uses anonymous/publishable Supabase access. Environment overrides are
 * optional because both public client values have checked-in fallbacks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import rapidResolutionNormalizer from './normalize-rapid-resolution-content.cjs';

dotenv.config({ quiet: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.resolve(process.env.PAGE_CONTENT_OUT_DIR || path.join(ROOT, 'src/content/pages'));
const MANIFEST_PATH = path.resolve(
  process.env.PAGE_SYNC_MANIFEST || path.join(ROOT, 'src/content/page-sync-manifest.json')
);
const PAGE_SIZE = 500;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://gcasbisxfrssonllpqrw.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_KEo-G1wij9RC_IDDzblisw_VISRvwrX';
const REQUIRE_SYNC = process.env.REQUIRE_PAGE_SYNC === '1';
const { normalizePageObject } = rapidResolutionNormalizer;

if (!SUPABASE_KEY) {
  const message = 'Supabase anonymous/publishable key not set; page_content sync skipped.';
  if (REQUIRE_SYNC) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
  console.warn(`WARNING: ${message}`);
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function validateRows(rows, expectedCount) {
  if (rows.length !== expectedCount) {
    throw new Error(`page_content count changed during sync (expected ${expectedCount}, fetched ${rows.length})`);
  }

  const seen = new Set();
  for (const row of rows) {
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    if (!SLUG_RE.test(slug)) {
      throw new Error('page_content contains a missing or invalid slug; refusing to write the local cache');
    }
    if (seen.has(slug)) {
      throw new Error(`page_content contains a duplicate slug: ${slug}`);
    }
    seen.add(slug);
  }
}

function pageObject(row) {
  return normalizePageObject({
    slug: row.slug,
    meta_title: row.meta_title || row.h1 || '',
    meta_description: row.meta_description || '',
    h1: row.h1 || '',
    hook: row.hook || '',
    bullets: Array.isArray(row.bullets) ? row.bullets : [],
    what: row.what || '',
    how: row.how || '',
    next: row.next || '',
    content: row.content || '',
    local_info: row.local_info || '',
    city: row.city || '',
    violation: row.violation || '',
    stats: row.stats && typeof row.stats === 'object' ? row.stats : {},
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
    video: row.video || null,
    jsonld: row.jsonld || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }, { curated: false });
}

function replaceCache(rows) {
  const parent = path.dirname(OUT_DIR);
  const tempDir = path.join(parent, `.pages-sync-${process.pid}`);
  const backupDir = path.join(parent, `.pages-backup-${process.pid}`);

  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, '.gitkeep'), '', 'utf8');

  for (const row of rows) {
    const page = pageObject(row);
    fs.writeFileSync(
      path.join(tempDir, `${page.slug}.json`),
      `${JSON.stringify(page, null, 2)}\n`,
      'utf8'
    );
  }

  let movedExisting = false;
  try {
    fs.mkdirSync(parent, { recursive: true });
    if (fs.existsSync(OUT_DIR)) {
      fs.renameSync(OUT_DIR, backupDir);
      movedExisting = true;
    }
    fs.renameSync(tempDir, OUT_DIR);
    if (movedExisting) fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(OUT_DIR) && movedExisting && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, OUT_DIR);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function writeManifest(count) {
  const manifest = {
    version: 1,
    source: 'page_content',
    syncedAt: new Date().toISOString(),
    fetchedCount: count,
    writtenCount: count,
  };
  const tempPath = `${MANIFEST_PATH}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, MANIFEST_PATH);
}

async function fetchAllRows() {
  const rows = [];
  let expectedCount = null;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error, count } = await supabase
      .from('page_content')
      .select('*', { count: from === 0 ? 'exact' : undefined })
      .order('slug', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (from === 0) expectedCount = count;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  if (!Number.isInteger(expectedCount)) {
    throw new Error('Supabase did not return an exact page_content count');
  }
  validateRows(rows, expectedCount);
  return rows;
}

try {
  console.log('Fetching page_content rows from Supabase...');
  const rows = await fetchAllRows();
  if (rows.length === 0) throw new Error('page_content returned zero rows; refusing to replace the local cache');
  replaceCache(rows);
  writeManifest(rows.length);
  console.log(`Page sync complete: ${rows.length} row(s) cached.`);
} catch (error) {
  const message = error && typeof error.message === 'string' ? error.message : 'unknown error';
  console.error(`Page sync failed: ${message}`);
  process.exit(1);
}
