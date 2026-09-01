#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { SITE, alternateLinks, loadLocaleSeoContext, localePath, splitSnapshotRoute } from './locale-seo.mjs';
dotenv.config();

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://gcasbisxfrssonllpqrw.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_KEo-G1wij9RC_IDDzblisw_VISRvwrX';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PAGE_SIZE = 1000;
const PAGE_CONTENT_DIR = path.resolve(
  process.env.PAGE_CONTENT_DIR || path.join(process.cwd(), 'src/content/pages')
);
const CURATED_PAGE_DIR = path.resolve(process.env.CURATED_PAGE_DIR || path.join(process.cwd(), 'ssg-pages'));
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_DIR = path.resolve(process.env.SITEMAP_PUBLIC_DIR || path.join(process.cwd(), 'public'));
const SEO_ROUTE_POLICIES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/config/seoRoutePolicies.json'), 'utf8'));
const EXCLUDED_PUBLIC_PATHS = new Set([
  ...Object.keys(SEO_ROUTE_POLICIES.redirects || {}),
  ...(SEO_ROUTE_POLICIES.gone || []),
]);

async function fetchAllRows(table, columns, configure = query => query) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = configure(
      supabase
        .from(table)
        .select(columns)
        .order('slug')
        .range(from, to)
    );
    const { data, error } = await query;

    if (error) throw new Error(`Error fetching ${table}: ${error.message}`);

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCachedPages() {
  if (!fs.existsSync(PAGE_CONTENT_DIR)) {
    throw new Error(`Local page_content cache is missing: ${PAGE_CONTENT_DIR}`);
  }

  const pages = [];
  const seen = new Set();
  for (const filename of fs.readdirSync(PAGE_CONTENT_DIR).filter(file => file.endsWith('.json')).sort()) {
    const fileSlug = path.basename(filename, '.json');
    const page = JSON.parse(fs.readFileSync(path.join(PAGE_CONTENT_DIR, filename), 'utf8'));
    const slug = typeof page?.slug === 'string' ? page.slug.trim() : '';
    if (!SLUG_RE.test(slug) || slug !== fileSlug || seen.has(slug)) {
      throw new Error(`Invalid or duplicate page_content cache entry: ${filename}`);
    }
    seen.add(slug);
    const curatedPath = path.join(CURATED_PAGE_DIR, filename);
    let reviewedAt;
    if (fs.existsSync(curatedPath)) {
      const curated = JSON.parse(fs.readFileSync(curatedPath, 'utf8'));
      reviewedAt = typeof curated?.reviewed_at === 'string' ? curated.reviewed_at : undefined;
    }
    // A reviewed curated record replaces the database body on the public page.
    // Its review date is therefore the truthful public lastmod; a later DB-only
    // update can belong to superseded copy that visitors never receive.
    pages.push({ slug, updated_at: reviewedAt || page.updated_at || undefined });
  }

  if (!pages.length) throw new Error('Local page_content cache contains zero pages');
  return pages;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function urlset(urls, localeContext) {
  const entries = urls.map(u => {
    const fields = [`<loc>${escapeXml(`https://fabsy.ca${u.loc}`)}</loc>`];
    if (u.changefreq) fields.push(`<changefreq>${escapeXml(u.changefreq)}</changefreq>`);
    if (u.priority) fields.push(`<priority>${escapeXml(u.priority)}</priority>`);
    if (u.lastmod) fields.push(`<lastmod>${escapeXml(u.lastmod)}</lastmod>`);
    const { code, basePath } = splitSnapshotRoute(u.loc, localeContext);
    for (const alternate of alternateLinks(localeContext, code, basePath)) {
      fields.push(`<xhtml:link rel="alternate" hreflang="${escapeXml(alternate.languageTag)}" href="${escapeXml(alternate.href)}" />`);
    }
    return `  <url>\n${fields.map(field => `    ${field}`).join('\n')}\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

function sitemapIndex(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(loc => `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

async function loadBlogPosts() {
  // An explicit fixture/cache makes offline and isolated release checks
  // deterministic; normal builds still use the published database inventory.
  if (process.env.SITEMAP_BLOG_CACHE) {
    const posts = JSON.parse(fs.readFileSync(process.env.SITEMAP_BLOG_CACHE, 'utf8'));
    const seen = new Set();
    if (!Array.isArray(posts)) throw new Error('SITEMAP_BLOG_CACHE must contain a blog-post array');
    for (const post of posts) {
      if (!SLUG_RE.test(post?.slug) || seen.has(post.slug) || (post.status && post.status !== 'published')) {
        throw new Error('SITEMAP_BLOG_CACHE contains an invalid, duplicate or unpublished post');
      }
      seen.add(post.slug);
    }
    return posts;
  }
  return fetchAllRows('blog_posts', 'slug, published_at, updated_at, reviewed_at, status', query => query.eq('status', 'published'));
}

function latestIso(...values) {
  const valid = values.filter(value => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  if (valid.length === 0) return undefined;
  return valid.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
}

export async function generateSitemap() {
  console.log('📊 Loading cached pages and fetching published blog posts...');
  const localeContext = loadLocaleSeoContext();

  // sync-pages-from-db.js runs immediately before this script when credentials
  // are available. Using that same cache keeps sitemap and snapshot coverage
  // coherent in staging and pull-request builds where live sync is skipped.
  const pages = loadCachedPages();

  // Blog posts
  const posts = await loadBlogPosts();

  console.log(`✅ Found ${pages.length} content page(s), ${posts.length} blog post(s)`);

  // Static pages + blog listing
  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/how-it-works', priority: '0.9', changefreq: 'weekly' },
    { loc: '/about', priority: '0.8', changefreq: 'monthly' },
    { loc: '/services', priority: '0.9', changefreq: 'weekly' },
    { loc: '/rapid-resolution', priority: '0.9', changefreq: 'weekly' },
    { loc: '/photo-radar', priority: '0.9', changefreq: 'weekly' },
    { loc: '/fleet', priority: '0.8', changefreq: 'monthly' },
    { loc: '/free-ticket-check', priority: '0.8', changefreq: 'monthly' },
    { loc: '/pro-drivers', priority: '0.8', changefreq: 'monthly' },
    { loc: '/refer', priority: '0.7', changefreq: 'monthly' },
    { loc: '/insurance-damage-report', priority: '0.8', changefreq: 'weekly' },
    { loc: '/testimonials', priority: '0.7', changefreq: 'weekly' },
    { loc: '/contact', priority: '0.8', changefreq: 'monthly' },
    { loc: '/terms-of-service', priority: '0.4', changefreq: 'monthly' },
    { loc: '/blog', priority: '0.8', changefreq: 'daily' },
    { loc: '/ai-info', priority: '0.8', changefreq: 'monthly' },
    { loc: '/founder', priority: '0.5', changefreq: 'monthly' },
    { loc: '/about/comparison', priority: '0.7', changefreq: 'monthly' },
    { loc: '/terms-of-purchase', priority: '0.4', changefreq: 'monthly' },
    { loc: '/hubs/alberta-tickets-101', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/photo-radar-vs-officer-issued', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/demerits-and-insurance', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/court-options-and-deadlines', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/city-specific-quirks', priority: '0.8', changefreq: 'monthly' },
  ];

  const pageContentUrls = pages.filter(
    p => !/^(?:test(?:[-_]|$)|verify-smoke(?:[-_]|$))/.test(p.slug) &&
      !EXCLUDED_PUBLIC_PATHS.has(`/content/${p.slug}`)
  ).map(p => ({
    loc: `/content/${p.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
    lastmod: p.updated_at
  }));

  const blogPostUrls = posts.filter(
    p => !EXCLUDED_PUBLIC_PATHS.has(`/blog/${p.slug}`)
  ).map(p => ({
    loc: `/blog/${p.slug}`,
    priority: '0.7',
    changefreq: 'weekly',
    lastmod: latestIso(p.published_at, p.updated_at, p.reviewed_at)
  }));

  // FAQ sitemap: include primary FAQ page; extend later with pages that include FAQ schema
  const faqUrls = [
    { loc: '/faq', changefreq: 'monthly', priority: '0.8' }
  ];

  // Write segmented sitemaps
  const pagesXmlPath = path.join(PUBLIC_DIR, 'sitemaps/sitemap-pages.xml');
  const contentXmlPath = path.join(PUBLIC_DIR, 'sitemaps/sitemap-content.xml');
  const faqXmlPath = path.join(PUBLIC_DIR, 'sitemaps/sitemap-faq.xml');

  ensureDir(pagesXmlPath);
  ensureDir(contentXmlPath);
  ensureDir(faqXmlPath);

  fs.writeFileSync(pagesXmlPath, urlset([...staticPages, ...blogPostUrls], localeContext));

  // Chunk content URLs: Google caps sitemaps at 50,000 URLs, but we chunk at 1,000
  // to keep files small and diffable. First chunk keeps the legacy filename.
  const CHUNK = 1000;
  const contentChunks = [];
  for (let i = 0; i < pageContentUrls.length; i += CHUNK) {
    contentChunks.push(pageContentUrls.slice(i, i + CHUNK));
  }
  if (contentChunks.length === 0) contentChunks.push([]);
  const contentPaths = contentChunks.map((_, i) =>
    path.join(PUBLIC_DIR, i === 0 ? 'sitemaps/sitemap-content.xml' : `sitemaps/sitemap-content-${i + 1}.xml`)
  );
  const expectedContentFiles = new Set(contentPaths.map(contentPath => path.basename(contentPath)));
  for (const filename of fs.readdirSync(path.dirname(contentXmlPath))) {
    if (/^sitemap-content(?:-\d+)?\.xml$/.test(filename) && !expectedContentFiles.has(filename)) {
      fs.unlinkSync(path.join(path.dirname(contentXmlPath), filename));
    }
  }
  contentChunks.forEach((chunk, i) => fs.writeFileSync(contentPaths[i], urlset(chunk, localeContext)));

  fs.writeFileSync(faqXmlPath, urlset(faqUrls, localeContext));

  // Keep the existing segmented English inventory. Each review-approved translation
  // gets only its real Phase 1 equivalents, never machine-only or English content
  // duplicates or intake/checkout/receipt URLs.
  const localePaths = [];
  for (const locale of localeContext.registry.locales.filter(item => item.code !== 'en')) {
    const filename = path.join(PUBLIC_DIR, 'sitemaps', `sitemap-${locale.code}.xml`);
    if (!localeContext.indexable(locale.code)) {
      fs.rmSync(filename, { force: true });
      continue;
    }
    const urls = [...localeContext.indexableRoutes].map(basePath => ({
      loc: localePath(locale.code, basePath),
      changefreq: 'monthly',
      priority: basePath === '/' ? '0.9' : '0.7',
    }));
    fs.writeFileSync(filename, urlset(urls, localeContext));
    localePaths.push(filename);
  }

  // Write sitemap index at root
  const indexXmlPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  const publicUrl = filename => `${SITE}/${path.relative(PUBLIC_DIR, filename).split(path.sep).join('/')}`;
  const index = sitemapIndex([
    publicUrl(pagesXmlPath),
    ...contentPaths.map(publicUrl),
    publicUrl(faqXmlPath),
    ...localePaths.map(publicUrl),
  ]);
  fs.writeFileSync(indexXmlPath, index);

  console.log('✅ Sitemaps written:');
  console.log('   -', indexXmlPath);
  console.log('   -', pagesXmlPath);
  contentPaths.forEach(contentPath => console.log('   -', contentPath));
  console.log('   -', faqXmlPath);
  localePaths.forEach(filename => console.log('   -', filename));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateSitemap().catch(err => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
}
