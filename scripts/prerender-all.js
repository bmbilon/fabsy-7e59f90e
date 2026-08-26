#!/usr/bin/env node
/**
 * Prerender static pages and blog posts for bot/AI crawlers.
 *
 * page_content routes are generated deterministically by
 * generate-static-snapshots.cjs. Browser-rendering them here is disabled by
 * default so this pass cannot overwrite those guarded snapshots.
 *
 * Usage:
 *   PRERENDER_BASE_URL=https://fabsy.ca PRERENDER_OUT_DIR=public/prerendered node scripts/prerender-all.js
 *   # or point to local preview server
 *   PRERENDER_BASE_URL=http://localhost:4173 PRERENDER_OUT_DIR=public/prerendered node scripts/prerender-all.js
 */
import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const BASE = process.env.PRERENDER_BASE_URL || 'https://fabsy.ca';
const OUT_DIR = process.env.PRERENDER_OUT_DIR || 'public/prerendered';
const PAGES_SITEMAP = process.env.PRERENDER_PAGES_SITEMAP || 'public/sitemaps/sitemap-pages.xml';
const TIMEOUT = Number(process.env.PRERENDER_TIMEOUT_MS || 30000);
const MAX_ATTEMPTS = Number(process.env.PRERENDER_MAX_ATTEMPTS || 2);
const INCLUDE_CONTENT_ROUTES = process.env.PRERENDER_CONTENT_ROUTES === '1';
const STATIC_ROUTES = [
  '/',
  '/faq',
  '/how-it-works',
  '/about',
  '/services',
  '/testimonials',
  '/contact',
  '/blog',
  '/ai-info',
  '/founder',
  '/about/comparison',
  '/submit-ticket',
  '/terms-of-purchase',
  '/traffic-ticket-assessment',
  '/traffic-ticket-assessment/examples',
  '/hubs/alberta-tickets-101',
  '/hubs/photo-radar-vs-officer-issued',
  '/hubs/demerits-and-insurance',
  '/hubs/court-options-and-deadlines',
  '/hubs/city-specific-quirks',
];

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

function toOutPath(route) {
  // Normalize leading slash
  const r = route.replace(/\/+$/,'');
  if (r === '' || r === '/') return path.join(OUT_DIR, 'index.html');
  // Special case existing FAQ pattern (backward-compatible)
  if (r === '/faq') return path.join(OUT_DIR, 'faq.html');
  const parts = r.split('/').filter(Boolean);
  return path.join(OUT_DIR, ...parts, 'index.html');
}

async function htmlFilesUnder(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFilesUnder(target));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(target);
  }
  return files;
}

async function removeEmptyParents(file, root) {
  let directory = path.dirname(file);
  while (directory !== root && directory.startsWith(`${root}${path.sep}`)) {
    const entries = await fs.readdir(directory);
    if (entries.length > 0) break;
    await fs.rmdir(directory);
    directory = path.dirname(directory);
  }
}

async function pruneStaleBrowserSnapshots(routes) {
  const root = path.resolve(OUT_DIR);
  const contentRoot = path.join(root, 'content');
  const expected = new Set(routes.map((route) => path.resolve(toOutPath(route))));
  const files = await htmlFilesUnder(root);
  let removed = 0;

  for (const file of files) {
    const resolved = path.resolve(file);
    // page_content snapshots are replaced atomically by the deterministic
    // generator and are never owned by this browser-rendering pass.
    if (resolved.startsWith(`${contentRoot}${path.sep}`)) continue;
    if (expected.has(resolved)) continue;
    await fs.rm(resolved, { force: true });
    await removeEmptyParents(resolved, root);
    removed += 1;
  }

  if (removed > 0) console.log(`🧹 Removed ${removed} stale browser snapshot(s).`);
}

async function prerenderRoute(browser, route) {
  const url = new URL(route, BASE).toString();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }});
    try {
      console.log(`→ Rendering ${url}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForSelector('#root h1', { timeout: TIMEOUT });

      // Blog data is asynchronous. Wait for the rendered contract rather than
      // global network silence because the non-blocking view-count update may
      // legitimately outlive the article render.
      if (route.startsWith('/blog/')) {
        await page.waitForSelector('#root main article h1', { timeout: TIMEOUT });
      } else if (route === '/blog') {
        await page.waitForSelector('#root main a[href^="/blog/"]', { timeout: TIMEOUT });
      }

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      const html = (await page.content()).replace(/[ \t]+$/gm, '');
      const outPath = toOutPath(route);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, html, 'utf8');
      console.log(`   ✓ Saved ${outPath} (${(html.length/1024).toFixed(1)}KB)`);
      return;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      console.warn(`   ⚠️  Render attempt ${attempt} failed: ${error?.message || error}`);
    } finally {
      await page.close();
    }
  }
}

async function fetchDynamicRoutes() {
  const routes = new Set(STATIC_ROUTES);

  // The generated sitemap is the release source of truth for published blog
  // URLs. Reading it locally keeps prerender coverage deterministic when an
  // anonymous Supabase key cannot list blog_posts (for example in staging).
  let blogRoutesLoadedFromSitemap = false;
  let routeInventoryComplete = false;
  try {
    const sitemap = await fs.readFile(PAGES_SITEMAP, 'utf8');
    const sitemapPaths = [];
    for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const pathname = new URL(match[1]).pathname.replace(/\/$/, '') || '/';
      sitemapPaths.push(pathname);
      if (pathname.startsWith('/blog/')) {
        routes.add(pathname);
        blogRoutesLoadedFromSitemap = true;
      }
    }
    routeInventoryComplete = sitemapPaths.includes('/') && sitemapPaths.includes('/blog');
  } catch (error) {
    console.warn(`⚠️  Could not read ${PAGES_SITEMAP}:`, error?.message || error);
  }

  if (!supabase) {
    console.warn('⚠️  Supabase credentials not set, skipping dynamic page prerender.');
    return { routes: Array.from(routes), routeInventoryComplete };
  }

  // Optional diagnostic mode only. page_content has no status column, and a
  // single query is capped by PostgREST, so fetch every slug in pages.
  if (INCLUDE_CONTENT_ROUTES) {
    try {
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data: pages, error } = await supabase
          .from('page_content')
          .select('slug')
          .order('slug', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        for (const page of pages || []) {
          if (page.slug) routes.add(`/content/${page.slug}`);
        }
        if (!pages || pages.length < pageSize) break;
      }
    } catch (error) {
      throw new Error(`Failed to fetch page_content routes: ${error?.message || 'unknown error'}`);
    }
  } else {
    console.log('ℹ️  Content routes use deterministic static snapshots; browser pass skipped them.');
  }

  // Fall back to the database only when the generated sitemap is unavailable.
  if (!blogRoutesLoadedFromSitemap) {
    try {
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('slug, status')
        .eq('status', 'published');
      if (error) throw error;
      for (const p of posts || []) {
        if (p.slug) routes.add(`/blog/${p.slug}`);
      }
      routeInventoryComplete = true;
    } catch (e) {
      console.warn('⚠️  Failed to fetch blog_posts:', e?.message || e);
    }
  }

  return { routes: Array.from(routes), routeInventoryComplete };
}

(async () => {
  console.log('🧱 Prerender-all starting...');
  console.log('   Base URL:', BASE);
  console.log('   Out dir :', OUT_DIR);

  const { routes, routeInventoryComplete } = await fetchDynamicRoutes();
  console.log(`📋 Total routes to render: ${routes.length}`);
  if (routeInventoryComplete) {
    await pruneStaleBrowserSnapshots(routes);
  } else {
    console.warn('⚠️  Route inventory is incomplete; stale snapshot pruning skipped.');
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const route of routes) {
      await prerenderRoute(browser, route);
    }
  } finally {
    await browser.close();
  }

  console.log('✅ Prerender-all complete. Files in', OUT_DIR);
})();
