/**
 * scripts/prerender-pages.js
 * Prerenders SPA routes (SSG pages) using Playwright and writes snapshots to /prerendered/<slug>/index.html
 *
 * Usage:
 *   PRERENDER_BASE_URL=https://fabsy.ca node scripts/prerender-pages.js
 * or (local preview)
 *   PRERENDER_BASE_URL=http://localhost:5173 node scripts/prerender-pages.js
 */
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.PRERENDER_BASE_URL || 'https://fabsy.ca';
const OUT_DIR = process.env.PRERENDER_OUT_DIR || 'prerendered';
const TIMEOUT = Number(process.env.PRERENDER_TIMEOUT_MS || 30000);

// get slugs from ssg-pages/*.json if present, else fallback to a small list
async function collectSlugs() {
  const dir = path.resolve(process.cwd(), 'ssg-pages');
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const slugs = [];
    for (const jf of jsonFiles) {
      const full = path.join(dir, jf);
      const raw = await fs.readFile(full, 'utf8');
      try {
        const obj = JSON.parse(raw);
        if (obj.slug) slugs.push(obj.slug);
      } catch (e) { /* ignore parse issues */ }
    }
    if (slugs.length) return slugs;
  } catch (e) {
    // no ssg-pages dir or it failed — fallback below
  }
  // FALLBACK: common/seed pages (edit to add more)
  return [
    'faq',
    'how-it-works',
    'fight-speeding-ticket-calgary',
    'fight-speeding-ticket-edmonton',
    'fight-speeding-ticket-lethbridge',
    'fight-speeding-ticket-medicine-hat',
    'fight-speeding-ticket-red-deer'
  ];
}

(async () => {
  const slugs = await collectSlugs();
  console.log(`Prerendering ${slugs.length} routes from base ${BASE}`);
  const browser = await chromium.launch({ args: ['--no-sandbox'], headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  for (const slug of slugs) {
    try {
      const route = slug === 'index' || slug === '' ? '/' : `/content/${slug.replace(/^\/+|\/+$/g,'')}`;
      const url = new URL(route, BASE).toString();
      console.log(`→ Rendering ${url} ...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT });

      // Wait a small extra bit for dynamic content (tweak if necessary)
      await page.waitForTimeout(500);

      // Optionally remove script tags for cleanliness (comment out if you want full HTML)
      // const html = await page.evaluate(() => {
      //   const doc = document.cloneNode(true);
      //   doc.querySelectorAll('script').forEach(s => s.remove());
      //   return '<!doctype html>\n' + doc.documentElement.outerHTML;
      // });

      // Keep the full hydrated HTML so crawlers see HTML+JSON-LD
      const html = await page.content();

      const outPath = path.join(process.cwd(), OUT_DIR, slug, 'index.html');
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, html, 'utf8');
      console.log(`  saved → ${outPath}`);
    } catch (err) {
      console.error(`  ERROR rendering ${slug}:`, err.message || err);
    }
  }

  await browser.close();
  console.log(`Prerender complete. Files in ./${OUT_DIR}/<slug>/index.html`);
})();
