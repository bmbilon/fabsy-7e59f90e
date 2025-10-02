#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

async function generateSitemap() {
  console.log('📊 Fetching all pages from database...');
  
  const { data: pages, error } = await supabase
    .from('page_content')
    .select('slug, updated_at')
    .order('slug');

  if (error) {
    console.error('Error fetching pages:', error);
    process.exit(1);
  }

  console.log(`✅ Found ${pages.length} pages`);

  const staticRoutes = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/faq', priority: '0.9', changefreq: 'weekly' },
    { url: '/how-it-works', priority: '0.9', changefreq: 'weekly' },
    { url: '/about', priority: '0.8', changefreq: 'monthly' },
    { url: '/services', priority: '0.9', changefreq: 'weekly' },
    { url: '/testimonials', priority: '0.7', changefreq: 'weekly' },
    { url: '/contact', priority: '0.8', changefreq: 'monthly' },
  ];

  const dynamicRoutes = pages.map(p => ({
    url: `/content/${p.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
    lastmod: p.updated_at
  }));

  const allRoutes = [...staticRoutes, ...dynamicRoutes];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes.map(route => `  <url>
    <loc>https://fabsy.ca${route.url}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
    ${route.lastmod ? `    <lastmod>${route.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync('public/sitemap.xml', sitemap);
  console.log(`✅ Sitemap generated: ${allRoutes.length} URLs`);
  console.log(`📁 Saved to: public/sitemap.xml`);
}

generateSitemap().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});