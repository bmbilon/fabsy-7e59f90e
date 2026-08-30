#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
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
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    pages.push({ slug, updated_at: page.updated_at || undefined });
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

function urlset(urls) {
  const entries = urls.map(u => {
    const fields = [`<loc>${escapeXml(`https://fabsy.ca${u.loc}`)}</loc>`];
    if (u.changefreq) fields.push(`<changefreq>${escapeXml(u.changefreq)}</changefreq>`);
    if (u.priority) fields.push(`<priority>${escapeXml(u.priority)}</priority>`);
    if (u.lastmod) fields.push(`<lastmod>${escapeXml(u.lastmod)}</lastmod>`);
    return `  <url>\n${fields.map(field => `    ${field}`).join('\n')}\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function sitemapIndex(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(loc => `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

async function generateSitemap() {
  console.log('📊 Loading cached pages and fetching published blog posts...');

  // sync-pages-from-db.js runs immediately before this script when credentials
  // are available. Using that same cache keeps sitemap and snapshot coverage
  // coherent in staging and pull-request builds where live sync is skipped.
  const pages = loadCachedPages();

  // Blog posts
  const posts = await fetchAllRows(
    'blog_posts',
    'slug, published_at, status',
    query => query.eq('status', 'published')
  );

  console.log(`✅ Found ${pages.length} content page(s), ${posts.length} blog post(s)`);

  // Static pages + blog listing
  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/how-it-works', priority: '0.9', changefreq: 'weekly' },
    { loc: '/about', priority: '0.8', changefreq: 'monthly' },
    { loc: '/services', priority: '0.9', changefreq: 'weekly' },
    { loc: '/rapid-resolution', priority: '0.9', changefreq: 'weekly' },
    { loc: '/insurance-damage-report', priority: '0.8', changefreq: 'weekly' },
    { loc: '/testimonials', priority: '0.7', changefreq: 'weekly' },
    { loc: '/contact', priority: '0.8', changefreq: 'monthly' },
    { loc: '/blog', priority: '0.8', changefreq: 'daily' },
    { loc: '/ai-info', priority: '0.8', changefreq: 'monthly' },
    { loc: '/founder', priority: '0.5', changefreq: 'monthly' },
    { loc: '/about/comparison', priority: '0.7', changefreq: 'monthly' },
    { loc: '/submit-ticket', priority: '0.9', changefreq: 'monthly' },
    { loc: '/terms-of-purchase', priority: '0.4', changefreq: 'monthly' },
    { loc: '/hubs/alberta-tickets-101', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/photo-radar-vs-officer-issued', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/demerits-and-insurance', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/court-options-and-deadlines', priority: '0.8', changefreq: 'monthly' },
    { loc: '/hubs/city-specific-quirks', priority: '0.8', changefreq: 'monthly' },
  ];

  const pageContentUrls = pages.filter(
    p => !/^(?:test(?:[-_]|$)|verify-smoke(?:[-_]|$))/.test(p.slug)
  ).map(p => ({
    loc: `/content/${p.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
    lastmod: p.updated_at
  }));

  const blogPostUrls = posts.map(p => ({
    loc: `/blog/${p.slug}`,
    priority: '0.7',
    changefreq: 'weekly',
    lastmod: p.published_at || undefined
  }));

  // FAQ sitemap: include primary FAQ page; extend later with pages that include FAQ schema
  const faqUrls = [
    { loc: '/faq', changefreq: 'monthly', priority: '0.8' }
  ];

  // Write segmented sitemaps
  const pagesXmlPath = 'public/sitemaps/sitemap-pages.xml';
  const contentXmlPath = 'public/sitemaps/sitemap-content.xml';
  const faqXmlPath = 'public/sitemaps/sitemap-faq.xml';

  ensureDir(pagesXmlPath);
  ensureDir(contentXmlPath);
  ensureDir(faqXmlPath);

  fs.writeFileSync(pagesXmlPath, urlset([...staticPages, ...blogPostUrls]));

  // Chunk content URLs: Google caps sitemaps at 50,000 URLs, but we chunk at 1,000
  // to keep files small and diffable. First chunk keeps the legacy filename.
  const CHUNK = 1000;
  const contentChunks = [];
  for (let i = 0; i < pageContentUrls.length; i += CHUNK) {
    contentChunks.push(pageContentUrls.slice(i, i + CHUNK));
  }
  if (contentChunks.length === 0) contentChunks.push([]);
  const contentPaths = contentChunks.map((_, i) =>
    i === 0 ? 'public/sitemaps/sitemap-content.xml' : `public/sitemaps/sitemap-content-${i + 1}.xml`
  );
  const expectedContentFiles = new Set(contentPaths.map(contentPath => path.basename(contentPath)));
  for (const filename of fs.readdirSync(path.dirname(contentXmlPath))) {
    if (/^sitemap-content(?:-\d+)?\.xml$/.test(filename) && !expectedContentFiles.has(filename)) {
      fs.unlinkSync(path.join(path.dirname(contentXmlPath), filename));
    }
  }
  contentChunks.forEach((chunk, i) => fs.writeFileSync(contentPaths[i], urlset(chunk)));

  fs.writeFileSync(faqXmlPath, urlset(faqUrls));

  // Write sitemap index at root
  const indexXmlPath = 'public/sitemap.xml';
  const index = sitemapIndex([
    'https://fabsy.ca/sitemaps/sitemap-pages.xml',
    ...contentPaths.map(p => 'https://fabsy.ca' + p.replace('public', '')),
    'https://fabsy.ca/sitemaps/sitemap-faq.xml',
  ]);
  fs.writeFileSync(indexXmlPath, index);

  console.log('✅ Sitemaps written:');
  console.log('   -', indexXmlPath);
  console.log('   -', pagesXmlPath);
  contentPaths.forEach(contentPath => console.log('   -', contentPath));
  console.log('   -', faqXmlPath);
}

generateSitemap().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
