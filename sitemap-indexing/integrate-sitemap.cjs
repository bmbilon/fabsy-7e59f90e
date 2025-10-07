#!/usr/bin/env node
/**
 * Sitemap Integration Script
 * Merges new city expansion URLs into main sitemap-content.xml
 */

const fs = require('fs');
const path = require('path');

function integrateSitemap() {
  console.log('🔄 Integrating city expansion URLs into main sitemap...');
  
  // Read existing sitemap-content.xml (if exists)
  let existingSitemap = '';
  const mainSitemapPath = './sitemap-content.xml';
  
  if (fs.existsSync(mainSitemapPath)) {
    existingSitemap = fs.readFileSync(mainSitemapPath, 'utf8');
    console.log('📄 Found existing sitemap-content.xml');
  } else {
    console.log('📄 Creating new sitemap-content.xml');
    existingSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
  }
  
  // Read new city expansion sitemap
  const newSitemap = fs.readFileSync('./sitemap-indexing/sitemap-city-expansion.xml', 'utf8');
  const newUrls = newSitemap.match(/<url>.*?<\/url>/gs) || [];
  
  // Insert new URLs before closing </urlset>
  const updatedSitemap = existingSitemap.replace(
    '</urlset>',
    `${newUrls.join('\n')}
</urlset>`
  );
  
  // Write updated sitemap
  fs.writeFileSync(mainSitemapPath, updatedSitemap);
  console.log(`✅ Added ${newUrls.length} URLs to main sitemap`);
  
  return newUrls.length;
}

if (require.main === module) {
  integrateSitemap();
}

module.exports = { integrateSitemap };
