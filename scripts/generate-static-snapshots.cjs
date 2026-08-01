#!/usr/bin/env node
/**
 * Generate full static HTML snapshots for /content/<slug> pages from ssg-pages/*.json.
 * Output: public/prerendered/content/<slug>/index.html
 * These are served to crawlers by functions/_middleware.ts (Cloudflare) or middleware.ts (Vercel).
 *
 * Rules enforced:
 * - Self-referential canonical to https://fabsy.ca/content/<slug>
 * - Visible FAQ text has exact wording parity with FAQPage JSON-LD
 * - Answer-first: hook is the first visible text after the H1
 *
 * Usage: node scripts/generate-static-snapshots.cjs [slug ...]
 *        (no args = all ssg-pages/*.json that have a non-empty hook)
 */
const fs = require("fs");
const path = require("path");

const SITE = "https://fabsy.ca";
const SRC_DIR = path.resolve(__dirname, "..", "ssg-pages");
const OUT_DIR = path.resolve(__dirname, "..", "public", "prerendered", "content");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function breadcrumbJsonLd(page) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: page.h1, item: `${SITE}/content/${page.slug}` },
    ],
  });
}

function legalServiceJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: "Fabsy Traffic Services",
    url: SITE,
    areaServed: { "@type": "State", name: "Alberta" },
    description:
      "Traffic ticket defense for Alberta drivers. Flat $488 representation plus 30% of any fine reduction achieved.",
    priceRange: "$488",
  });
}

function render(page) {
  const url = `${SITE}/content/${page.slug}`;
  const faqsHtml = (page.faqs || [])
    .map(
      (f) => `      <details>
        <summary><h3>${esc(f.q)}</h3></summary>
        <p>${esc(f.a)}</p>
      </details>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(page.meta_title)}</title>
  <meta name="description" content="${esc(page.meta_description)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow">
  <meta name="geo.region" content="CA-AB">
  <meta property="og:title" content="${esc(page.meta_title)}">
  <meta property="og:description" content="${esc(page.meta_description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="Fabsy Traffic Services">
  <meta property="og:locale" content="en_CA">
  <script type="application/ld+json">${page.jsonld}</script>
  <script type="application/ld+json">${breadcrumbJsonLd(page)}</script>
  <script type="application/ld+json">${legalServiceJsonLd()}</script>
  <style>
    body{font-family:Inter,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;line-height:1.6;color:#1a1a2e}
    header nav a{margin-right:16px;color:#7c3aed;text-decoration:none}
    .hook{font-size:1.1rem;font-weight:500;background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;margin:16px 0}
    ul.key-facts li{margin:6px 0}
    details{border-bottom:1px solid #e5e7eb;padding:8px 0}
    summary h3{display:inline;font-size:1rem}
    .cta{display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0}
    footer{margin-top:40px;font-size:.85rem;color:#555}
  </style>
</head>
<body>
  <header>
    <nav>
      <a href="/">Fabsy</a>
      <a href="/how-it-works">How It Works</a>
      <a href="/faq">FAQ</a>
      <a href="/submit-ticket">Submit Your Ticket</a>
    </nav>
  </header>
  <main>
    <article>
      <h1>${esc(page.h1)}</h1>
      <p class="hook">${esc(page.hook)}</p>
      <h2>Key facts</h2>
      <ul class="key-facts">
${(page.bullets || []).map((b) => `        <li>${esc(b)}</li>`).join("\n")}
      </ul>
${page.what || ""}
${page.how || ""}
${page.next || ""}
      <p><a class="cta" href="/submit-ticket">Get a free ticket assessment</a></p>
      <section>
      <h2>Frequently Asked Questions</h2>
${faqsHtml}
      </section>
    </article>
  </main>
  <footer>
    <p>Fabsy Traffic Services. Traffic ticket defense for Alberta drivers. Flat $488 representation plus 30% of any fine reduction achieved. Fabsy is not a law firm; we are authorized agents for Alberta traffic matters.</p>
    <p><a href="/content/fight-traffic-ticket-alberta">Fight a ticket in Alberta</a> · <a href="/content/speeding-ticket-alberta">Speeding tickets</a> · <a href="/content/photo-radar-ticket-alberta">Photo radar</a> · <a href="/content/fight-traffic-ticket-calgary">Calgary</a> · <a href="/content/fight-traffic-ticket-edmonton">Edmonton</a></p>
  </footer>
</body>
</html>
`;
}

const args = process.argv.slice(2);
const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => (args.length ? args.includes(f.replace(/\.json$/, "")) : true));

let written = 0;
for (const file of files) {
  const page = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), "utf8"));
  if (!page.hook || !page.hook.trim()) continue; // skip legacy stubs with no body content
  const dir = path.join(OUT_DIR, page.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), render(page));
  written++;
  console.log(`✓ public/prerendered/content/${page.slug}/index.html`);
}
console.log(`${written} snapshot(s) written.`);
