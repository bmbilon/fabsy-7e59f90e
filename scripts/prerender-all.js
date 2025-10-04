#!/usr/bin/env node
/**
 * Prerender critical pages for bot/AI crawlers and save static HTML under public/prerendered
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
const TIMEOUT = Number(process.env.PRERENDER_TIMEOUT_MS || 30000);

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

async function prerenderRoute(browser, route) {
  const url = new URL(route, BASE).toString();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }});
  try {
    console.log(`→ Rendering ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT });
    await page.waitForTimeout(500);
    const html = await page.content();
    const outPath = toOutPath(route);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, 'utf8');
    console.log(`   ✓ Saved ${outPath} (${(html.length/1024).toFixed(1)}KB)`);
  } finally {
    await page.close();
  }
}

async function fetchDynamicRoutes() {
  const routes = new Set();
  // Static pages
  ['/', '/faq', '/how-it-works', '/about', '/services', '/contact', '/blog']
    .forEach(r => routes.add(r));

  if (!supabase) {
    console.warn('⚠️  Supabase credentials not set, skipping dynamic page prerender.');
    return Array.from(routes);
  }

  // Content pages (from page_content)
  try {
    const { data: pages, error } = await supabase
      .from('page_content')
      .select('slug, status')
      .eq('status', 'published');
    if (!error && Array.isArray(pages)) {
      for (const p of pages) {
        if (p.slug) routes.add(`/content/${p.slug}`);
      }
    }
  } catch (e) {
    console.warn('⚠️  Failed to fetch page_content:', e?.message || e);
  }

  // Blog posts (from blog_posts)
  try {
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('slug, status')
      .eq('status', 'published');
    if (!error && Array.isArray(posts)) {
      for (const p of posts) {
        if (p.slug) routes.add(`/blog/${p.slug}`);
      }
    }
  } catch (e) {
    console.warn('⚠️  Failed to fetch blog_posts:', e?.message || e);
  }

  return Array.from(routes);
}

(async () => {
  console.log('🧱 Prerender-all starting...');
  console.log('   Base URL:', BASE);
  console.log('   Out dir :', OUT_DIR);

  const routes = await fetchDynamicRoutes();
  console.log(`📋 Total routes to render: ${routes.length}`);

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