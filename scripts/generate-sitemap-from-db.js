#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function urlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url>\n    <loc>https://fabsy.ca${u.loc}</loc>\n    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ''}\n    ${u.priority ? `<priority>${u.priority}</priority>` : ''}\n    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}\n  </url>`).join('\n')}\n</urlset>`;
}

function sitemapIndex(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(loc => `  <sitemap><loc>${loc}</loc></sitemap>`).join('\n')}\n</sitemapindex>`;
}

async function generateSitemap() {
  console.log('📊 Fetching pages and blog posts from database...');

  // Content pages
  const { data: pages, error: pagesErr } = await supabase
    .from('page_content')
    .select('slug, updated_at')
    .order('slug');
  if (pagesErr) {
    console.error('Error fetching page_content:', pagesErr);
    process.exit(1);
  }

  // Blog posts
  const { data: posts, error: postsErr } = await supabase
    .from('blog_posts')
    .select('slug, published_at, status')
    .eq('status', 'published')
    .order('slug');
  if (postsErr) {
    console.error('Error fetching blog_posts:', postsErr);
    process.exit(1);
  }

  console.log(`✅ Found ${pages.length} content page(s), ${posts.length} blog post(s)`);

  // Static pages + blog listing
  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/how-it-works', priority: '0.9', changefreq: 'weekly' },
    { loc: '/about', priority: '0.8', changefreq: 'monthly' },
    { loc: '/services', priority: '0.9', changefreq: 'weekly' },
    { loc: '/testimonials', priority: '0.7', changefreq: 'weekly' },
    { loc: '/contact', priority: '0.8', changefreq: 'monthly' },
    { loc: '/blog', priority: '0.8', changefreq: 'daily' },
    // Thank You page: included by request for QA/analytics visibility; remains noindex via meta
    { loc: '/thank-you', priority: '0.1', changefreq: 'yearly' },
  ];

  const pageContentUrls = pages.map(p => ({
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
  fs.writeFileSync(contentXmlPath, urlset(pageContentUrls));
  fs.writeFileSync(faqXmlPath, urlset(faqUrls));

  // Write sitemap index at root
  const indexXmlPath = 'public/sitemap.xml';
  const index = sitemapIndex([
    'https://fabsy.ca/sitemaps/sitemap-pages.xml',
    'https://fabsy.ca/sitemaps/sitemap-content.xml',
    'https://fabsy.ca/sitemaps/sitemap-faq.xml',
  ]);
  fs.writeFileSync(indexXmlPath, index);

  console.log('✅ Sitemaps written:');
  console.log('   -', indexXmlPath);
  console.log('   -', pagesXmlPath);
  console.log('   -', contentXmlPath);
  console.log('   -', faqXmlPath);
}

generateSitemap().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
