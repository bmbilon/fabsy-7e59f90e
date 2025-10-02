/**
 * scripts/prerender.js
 * Prerenders a single SPA route (SSG page) using Playwright
 *
 * Usage:
 *   node scripts/prerender.js --slug="fight-speeding-ticket-calgary"
 *   PRERENDER_BASE_URL=http://localhost:5173 node scripts/prerender.js --slug="test-page"
 */
import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

const BASE = process.env.PRERENDER_BASE_URL || 'https://fabsy.ca';
const OUT_DIR = process.env.PRERENDER_OUT_DIR || 'prerendered';
const TIMEOUT = Number(process.env.PRERENDER_TIMEOUT_MS || 30000);

// Parse command line arguments
const args = process.argv.slice(2);
const slugArg = args.find(arg => arg.startsWith('--slug='));

if (!slugArg) {
  console.error('Usage: node scripts/prerender.js --slug="your-page-slug"');
  console.error('Example: node scripts/prerender.js --slug="fight-speeding-ticket-calgary"');
  process.exit(1);
}

const slug = slugArg.split('=')[1].replace(/['"]/g, '');

if (!slug) {
  console.error('Error: slug cannot be empty');
  process.exit(1);
}

(async () => {
  console.log(`Prerendering single page: ${slug}`);
  console.log(`Base URL: ${BASE}`);
  
  const browser = await chromium.launch({ 
    args: ['--no-sandbox'], 
    headless: true 
  });
  
  const page = await browser.newPage({ 
    viewport: { width: 1200, height: 900 } 
  });

  try {
    // Construct the route - most pages are under /content/
    const route = slug === 'index' || slug === '' ? '/' : `/content/${slug.replace(/^\/+|\/+$/g,'')}`;
    const url = new URL(route, BASE).toString();
    
    console.log(`→ Rendering ${url} ...`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle', 
      timeout: TIMEOUT 
    });

    // Wait a bit for dynamic content to load
    await page.waitForTimeout(1000);

    // Get the full HTML content
    const html = await page.content();

    // Write to output directory
    const outPath = path.join(process.cwd(), OUT_DIR, slug, 'index.html');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, 'utf8');
    
    console.log(`✅ Successfully saved → ${outPath}`);
    console.log(`📏 HTML size: ${(html.length / 1024).toFixed(1)}KB`);
    
    // Quick verification - check if JSON-LD is present
    if (html.includes('application/ld+json')) {
      console.log('✅ JSON-LD structured data detected');
    } else {
      console.log('⚠️  No JSON-LD structured data found');
    }
    
  } catch (err) {
    console.error(`❌ Error rendering ${slug}:`, err.message || err);
    process.exit(1);
  }

  await browser.close();
  console.log(`🎉 Prerender complete for slug: ${slug}`);
})();