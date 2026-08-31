#!/usr/bin/env node
/**
 * Generate crawler snapshots for every page_content row with a usable, unique
 * slug, plus any curated-only route.
 *
 * Database rows are supplied by scripts/sync-pages-from-db.js in
 * src/content/pages. A reviewed ssg-pages file with a non-empty hook overrides
 * the matching database row. Legacy database rows receive a conservative,
 * answer-first template because their old free-form content contains claims
 * that do not meet the current publishing guardrails.
 *
 * Output: public/prerendered/content/<slug>/index.html
 * Usage: node scripts/generate-static-snapshots.cjs [slug ...]
 */
const fs = require('fs');
const path = require('path');
const {
  EXACT_FABSY_PRICING,
  curatedPageIssues,
  textGuardrailIssues,
} = require('./curated-content-guardrails.cjs');
const {
  INSURANCE_REPORT_NAME,
  RAPID_RESOLUTION_ACTION_COMMITMENT,
  RAPID_RESOLUTION_NAME,
  RAPID_RESOLUTION_OUTCOME_DISCLAIMER,
  RAPID_RESOLUTION_SPEED_DISCLAIMER,
  canonicalFaqs,
} = require('./normalize-rapid-resolution-content.cjs');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://fabsy.ca';
const BUSINESS_NAME = 'Fabsy Traffic Ticket Services';
const TELEPHONE = '(825) 793-2279';
const EMAIL = 'hello@fabsy.ca';
const PRICING_TEXT = EXACT_FABSY_PRICING;
const DB_DIR = path.resolve(process.env.PAGE_CONTENT_DIR || path.join(ROOT, 'src/content/pages'));
const CURATED_DIR = path.resolve(process.env.SNAPSHOT_CURATED_DIR || path.join(ROOT, 'ssg-pages'));
const OUT_DIR = path.resolve(
  process.env.SNAPSHOT_OUT_DIR || path.join(ROOT, 'public/prerendered/content')
);
const MANIFEST_PATH = path.resolve(
  process.env.SNAPSHOT_MANIFEST || path.join(path.dirname(OUT_DIR), 'content-manifest.json')
);
const SYNC_MANIFEST_PATH = path.resolve(
  process.env.PAGE_SYNC_MANIFEST || path.join(ROOT, 'src/content/page-sync-manifest.json')
);
const REQUIRE_SYNC_MANIFEST = process.env.REQUIRE_PAGE_SYNC_MANIFEST === '1';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const args = process.argv.slice(2);

const present = (value) => typeof value === 'string' && value.trim().length > 0;
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function readPages(directory, label) {
  const pages = new Map();
  if (!fs.existsSync(directory)) {
    if (label === 'page_content') {
      throw new Error(`source invariant failed: page_content cache directory is missing: ${directory}`);
    }
    return pages;
  }

  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    const fileSlug = path.basename(file, '.json');
    let page;
    try {
      page = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    } catch (error) {
      throw new Error(`${label} source contains invalid JSON: ${file}`);
    }
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      throw new Error(`${label} source is not a page object: ${file}`);
    }
    if (!SLUG_RE.test(fileSlug)) {
      throw new Error(
        `source invariant failed: ${label} filename does not contain a usable slug: ${file}`
      );
    }
    if (pages.has(page.slug)) {
      throw new Error(
        `source invariant failed: ${label} contains duplicate slug ${page.slug}; one URL cannot represent both rows`
      );
    }
    if (page.slug !== fileSlug) {
      throw new Error(
        `source invariant failed: ${label} slug does not match its filename: ${file}`
      );
    }
    pages.set(page.slug, page);
  }
  return pages;
}

function readSyncManifest(dbCount) {
  if (!fs.existsSync(SYNC_MANIFEST_PATH)) {
    if (REQUIRE_SYNC_MANIFEST) {
      throw new Error('required page_content sync manifest is missing');
    }
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(SYNC_MANIFEST_PATH, 'utf8'));
  } catch (_) {
    throw new Error('page_content sync manifest is invalid JSON');
  }
  if (
    manifest.source !== 'page_content' ||
    manifest.fetchedCount !== dbCount ||
    manifest.writtenCount !== dbCount
  ) {
    throw new Error(
      'source invariant failed: page_content cache does not match its sync manifest ' +
        `(${dbCount} files, ${manifest.fetchedCount} fetched, ${manifest.writtenCount} written)`
    );
  }
  return manifest;
}

function textGuardrailIssue(value, slug) {
  return textGuardrailIssues(value, slug)[0] || null;
}

function assertCuratedPageSafe(page) {
  const issues = curatedPageIssues(page);
  if (issues.length) {
    throw new Error(`curated page ${page.slug} failed admission: ${issues.join('; ')}`);
  }
}

function normalizeFaqs(faqs) {
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((faq) => ({
      q: typeof faq?.q === 'string' ? faq.q.trim() : '',
      a: typeof faq?.a === 'string' ? faq.a.trim() : '',
    }))
    .filter((faq) => faq.q && faq.a);
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) => ({
      title: typeof source?.title === 'string' ? source.title.trim() : '',
      url: typeof source?.url === 'string' ? source.url.trim() : '',
    }))
    .filter((source) => source.title && source.url);
}

function reviewedLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function fallbackFaqs() {
  return canonicalFaqs();
}

function safeLegacyCity(page) {
  const city = present(page.city) ? page.city.trim() : '';
  return /^[A-Za-z][A-Za-z .'-]{1,58}$/.test(city) && !textGuardrailIssue(city)
    ? city
    : 'Alberta';
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bRcmp\b/g, 'RCMP');
}

function safeLegacyViolation(page) {
  const supplied = present(page.violation) ? page.violation.trim().replace(/\s+ticket$/i, '') : '';
  if (
    supplied
    && /^[A-Za-z][A-Za-z0-9 /&'-]{1,58}$/.test(supplied)
    && !textGuardrailIssue(supplied, page.slug)
  ) {
    return titleCase(supplied);
  }

  const slug = present(page.slug) ? page.slug.toLowerCase() : '';
  const derived = slug.match(/^(?:fight-)?(.+?)-ticket(?:-|$)/)?.[1]?.replace(/-/g, ' ');
  return derived ? titleCase(derived) : 'Traffic';
}

function safeLegacyH1(page) {
  const city = safeLegacyCity(page);
  const violation = safeLegacyViolation(page);
  const slug = present(page.slug) ? page.slug.toLowerCase() : '';

  if (slug.startsWith('fight-')) return `Fight a ${violation} Ticket in ${city}`;
  if (slug.includes('-photo-radar')) {
    return violation.toLowerCase() === 'red light'
      ? `Red Light Camera Ticket in ${city}`
      : `${violation} Photo Radar Ticket in ${city}`;
  }
  if (slug.includes('-multiple-tickets')) return `Multiple ${violation} Tickets in ${city}`;
  if (slug.includes('-commercial-driver')) return `${violation} Ticket for Commercial Drivers in ${city}`;
  if (slug.includes('-new-driver')) return `${violation} Ticket for New Drivers in ${city}`;
  if (slug.includes('-first-time-offender')) return `${violation} Ticket: First Offence in ${city}`;
  if (slug.includes('-out-of-province')) return `${violation} Ticket for Out-of-Province Drivers in ${city}`;
  if (slug.includes('-officer-error')) return `${violation} Ticket and Possible Officer Error in ${city}`;
  if (slug.includes('-weather-conditions')) return `${violation} Ticket in Poor Weather in ${city}`;
  return `${violation} Ticket in ${city}`;
}

function legacyTitle(h1) {
  const withoutBrand = h1.replace(/\s*\|\s*Fabsy\s*$/i, '').trim();
  const suffix = ' | Fabsy';
  const intentTitle = `${withoutBrand}: Options & Next Steps`;
  if (intentTitle.length + suffix.length <= 60) return `${intentTitle}${suffix}`;
  if (withoutBrand.length + suffix.length <= 60) return `${withoutBrand}${suffix}`;
  return `${withoutBrand.slice(0, 60 - suffix.length).trim()}${suffix}`;
}

function legacyDescription(page) {
  return 'Rapid Resolution for an eligible Alberta traffic ticket: secure intake, disclosure analysis, prosecutor review and immediate client updates.';
}

function normalizedPage(basePage, curated) {
  if (curated) {
    assertCuratedPageSafe(basePage);
    return {
      ...basePage,
      meta_title: basePage.meta_title.trim(),
      meta_description: basePage.meta_description.trim(),
      h1: basePage.h1.trim(),
      hook: basePage.hook.trim(),
      bullets: Array.isArray(basePage.bullets) ? basePage.bullets.map(String) : [],
      faqs: normalizeFaqs(basePage.faqs),
      sources: normalizeSources(basePage.sources),
      reviewed_at: typeof basePage.reviewed_at === 'string' ? basePage.reviewed_at.trim() : '',
      curated: true,
    };
  }

  const h1 = safeLegacyH1(basePage);
  return {
    ...basePage,
    meta_title: legacyTitle(h1),
    meta_description: legacyDescription(basePage),
    h1,
    hook: 'Check the dispute deadline printed on your ticket and review your options before deciding how to respond.',
    bullets: [
      'The dispute deadline is printed on the ticket.',
      'Secure digital ticket intake, eligibility review and authorization.',
      'Disclosure request, document tracking and technology-assisted analysis with qualified review.',
      RAPID_RESOLUTION_ACTION_COMMITMENT,
      'Trial representation, government fines and out-of-scope matters are separate.',
    ],
    what: '',
    how: '',
    next: '',
    content: '',
    local_info: '',
    stats: {},
    faqs: fallbackFaqs(),
    curated: false,
  };
}

function faqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };
}

function breadcrumbJsonLd(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: page.h1, item: `${SITE}/content/${page.slug}` },
    ],
  };
}

function professionalServiceJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: BUSINESS_NAME,
    url: SITE,
    telephone: TELEPHONE,
    email: EMAIL,
    areaServed: { '@type': 'AdministrativeArea', name: 'Alberta, Canada' },
    description: `Traffic ticket agent service for Alberta drivers. Fabsy is not a law firm. ${PRICING_TEXT}`,
    offers: {
      '@type': 'Offer',
      description: PRICING_TEXT,
    },
  };
}

function articleJsonLd(page, url) {
  if (!page.curated || !page.reviewed_at || page.sources.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.h1,
    description: page.meta_description,
    url,
    dateModified: page.reviewed_at,
    author: { '@type': 'Organization', name: BUSINESS_NAME, url: SITE },
    publisher: { '@type': 'Organization', name: BUSINESS_NAME, url: SITE },
    citation: page.sources.map((source) => source.url),
  };
}

function curatedSections(page) {
  return [page.what, page.how, page.next].filter(present).join('\n');
}

function fallbackSections(page) {
  const ticket = `${safeLegacyViolation(page).toLowerCase()} ticket`;
  const city = safeLegacyCity(page);
  return `      <h2>What should I do after receiving a ${esc(ticket)} in ${esc(city)}?</h2>
      <p>Check the instructions and response deadline printed on the ticket before choosing how to respond. Keep a copy and gather any relevant photos, video, or documents.</p>
      <h2>What to do next</h2>
      <ol>
        <li>Check the dispute deadline printed on the ticket.</li>
        <li>Keep the ticket and gather any relevant photos, video, or documents.</li>
        <li>Review the available response options before the printed deadline.</li>
      </ol>
      <h2>How ${RAPID_RESOLUTION_NAME} works</h2>
      <ol>
        <li>Upload the ticket and complete the digital consent and authorization.</li>
        <li>Fabsy requests disclosure and tracks it to the file.</li>
        <li>Technology-assisted disclosure analysis receives qualified review before a fact-specific prosecutor-review request is prepared.</li>
        <li>Fabsy immediately notifies the client about file changes and explains any Crown response in plain language.</li>
      </ol>
      <p>${RAPID_RESOLUTION_ACTION_COMMITMENT}</p>
      <p>${RAPID_RESOLUTION_SPEED_DISCLAIMER}</p>
      <p>${RAPID_RESOLUTION_OUTCOME_DISCLAIMER}</p>
      <p>Fabsy provides agent services for eligible Alberta pre-trial traffic matters and is not a law firm.</p>
      <p>${PRICING_TEXT}</p>`;
}

function render(page) {
  const url = `${SITE}/content/${page.slug}`;
  const robots = /^(?:test(?:-|$)|verify-smoke(?:-|$))/.test(page.slug)
    ? 'noindex, nofollow'
    : 'index, follow';
  const faqsHtml = page.faqs
    .map(
      (faq) => `      <details>
        <summary><h3>${esc(faq.q)}</h3></summary>
        <p>${esc(faq.a)}</p>
      </details>`
    )
    .join('\n');
  const sections = page.curated ? curatedSections(page) : fallbackSections(page);
  const articleSchema = articleJsonLd(page, url);
  const sourcesHtml = page.curated && page.sources.length
    ? `      <aside class="triage sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources checked</h2>
        ${page.reviewed_at ? `<p><strong>Reviewed:</strong> ${esc(reviewedLabel(page.reviewed_at))}</p>` : ''}
        <ul>
${page.sources.map((source) => `          <li><a href="${esc(source.url)}" rel="noopener noreferrer">${esc(source.title)}</a></li>`).join('\n')}
        </ul>
        <p>Rules and procedures can change. Use the current official source and the instructions printed on the individual ticket.</p>
      </aside>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en-CA">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(page.meta_title)}</title>
  <meta name="description" content="${esc(page.meta_description)}">
  <link rel="canonical" href="${url}">
${robots === 'index, follow' ? `  <link rel="alternate" hreflang="en" href="${url}">\n  <link rel="alternate" hreflang="x-default" href="${url}">\n` : ''}  <!-- Content pages remain English until their own translations are reviewed. -->
  <meta name="robots" content="${robots}">
  <meta name="geo.region" content="CA-AB">
  <meta property="og:title" content="${esc(page.meta_title)}">
  <meta property="og:description" content="${esc(page.meta_description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="${BUSINESS_NAME}">
  <meta property="og:locale" content="en_CA">
  <script type="application/ld+json">${safeJsonLd(faqJsonLd(page.faqs))}</script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbJsonLd(page))}</script>
  <script type="application/ld+json">${safeJsonLd(professionalServiceJsonLd())}</script>
${articleSchema ? `  <script type="application/ld+json">${safeJsonLd(articleSchema)}</script>\n` : ''}  <style>
    body{font-family:Inter,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;line-height:1.6;color:#1a1a2e}
    header nav a{margin-right:16px;color:#7c3aed;text-decoration:none}
    .hook{font-size:1.1rem;font-weight:500;background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;margin:16px 0}
    .triage{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:20px;margin:28px 0}
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
      <a href="/submit-ticket">Rapid Resolution</a>
      <a href="/submit-ticket">Submit Your Ticket</a>
    </nav>
  </header>
  <main>
    <article>
      <h1>${esc(page.h1)}</h1>
      <p class="hook">${esc(page.hook)}</p>
      <h2>Key facts</h2>
      <ul class="key-facts">
${page.bullets.map((bullet) => `        <li>${esc(bullet)}</li>`).join('\n')}
      </ul>
${sections}
${sourcesHtml ? `${sourcesHtml}\n` : ''}      <section class="triage" aria-labelledby="rapid-resolution-heading">
        <h2 id="rapid-resolution-heading">Start ${RAPID_RESOLUTION_NAME}</h2>
        <p>Rapid Resolution is Fabsy's end-to-end agent service for eligible Alberta pre-trial traffic matters.</p>
        <ul>
          <li>Secure digital intake and authorization</li>
          <li>Disclosure request, tracking and qualified analysis</li>
          <li>A fact-specific prosecutor-review submission</li>
          <li>Immediate client updates and a plain-language Crown-response comparison</li>
        </ul>
        <p>${RAPID_RESOLUTION_ACTION_COMMITMENT}</p>
        <p>${RAPID_RESOLUTION_SPEED_DISCLAIMER}</p>
        <p>${PRICING_TEXT}</p>
        <p>The ${INSURANCE_REPORT_NAME} provides consumer research and planning information, not an insurer quote or licensed broker recommendation.</p>
        <p><a class="cta" href="/submit-ticket">Start Rapid Resolution</a></p>
      </section>
      <section>
        <h2>Frequently Asked Questions</h2>
${faqsHtml}
      </section>
    </article>
  </main>
  <footer>
    <p>${BUSINESS_NAME}. ${PRICING_TEXT} Fabsy is an agent service for Alberta traffic matters and is not a law firm.</p>
    <p><a href="tel:+18257932279">${TELEPHONE}</a> · <a href="mailto:${EMAIL}">${EMAIL}</a></p>
    <p><a href="/content/fight-traffic-ticket-alberta">Fight a ticket in Alberta</a> · <a href="/content/speeding-ticket-alberta">Speeding tickets</a> · <a href="/content/photo-radar-ticket-alberta">Photo radar</a> · <a href="/content/fight-traffic-ticket-calgary">Calgary</a> · <a href="/content/fight-traffic-ticket-edmonton">Edmonton</a></p>
  </footer>
</body>
</html>
`;

  const issue = textGuardrailIssue(html, page.slug);
  if (issue) throw new Error(`rendered snapshot ${page.slug} contains a ${issue}`);
  for (const match of html.matchAll(/(\d{1,3})%\+?\s+success(?:\s+rate)?/gi)) {
    if (Number(match[1]) > 95) {
      throw new Error(`rendered snapshot ${page.slug} exceeds the success-rate guardrail`);
    }
  }
  return html;
}

function replaceOutput(rendered) {
  if (path.basename(OUT_DIR) !== 'content') {
    throw new Error('SNAPSHOT_OUT_DIR must end in a content directory');
  }
  const parent = path.dirname(OUT_DIR);
  const tempDir = path.join(parent, `.content-snapshots-${process.pid}`);
  const backupDir = path.join(parent, `.content-backup-${process.pid}`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  for (const [slug, html] of rendered) {
    const directory = path.join(tempDir, slug);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), html, 'utf8');
  }

  let movedExisting = false;
  try {
    if (fs.existsSync(OUT_DIR)) {
      fs.renameSync(OUT_DIR, backupDir);
      movedExisting = true;
    }
    fs.renameSync(tempDir, OUT_DIR);
    if (movedExisting) fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(OUT_DIR) && movedExisting && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, OUT_DIR);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function writeManifest(manifest) {
  const tempPath = `${MANIFEST_PATH}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, MANIFEST_PATH);
}

try {
  const dbPages = readPages(DB_DIR, 'page_content');
  const curatedPages = readPages(CURATED_DIR, 'curated');
  if (dbPages.size === 0) {
    throw new Error('source invariant failed: page_content cache contains zero rows');
  }
  const syncManifest = readSyncManifest(dbPages.size);
  const dbSlugs = [...dbPages.keys()].sort();
  const curatedSourceSlugs = [...curatedPages.keys()].sort();
  const allSlugs = [...new Set([...dbSlugs, ...curatedSourceSlugs])].sort();

  if (allSlugs.length === 0) throw new Error('no page sources found');
  const requested = args.length ? new Set(args) : null;
  if (requested) {
    for (const slug of requested) {
      if (!allSlugs.includes(slug)) throw new Error(`unknown snapshot slug requested: ${slug}`);
    }
  }

  const rendered = new Map();
  let curatedCount = 0;
  let fallbackCount = 0;
  const curatedSlugs = [];
  const quarantinedCuratedSlugs = [];

  for (const slug of allSlugs) {
    if (requested && !requested.has(slug)) continue;
    const dbPage = dbPages.get(slug);
    const curatedPage = curatedPages.get(slug);
    const claimsReviewed = Boolean(curatedPage && present(curatedPage.hook));
    const sourcePage = claimsReviewed
      ? { ...(dbPage || {}), ...curatedPage }
      : (dbPage || curatedPage);
    if (!sourcePage || sourcePage.slug !== slug) {
      throw new Error(`source invariant failed: no unambiguous source row exists for ${slug}`);
    }
    const reviewedCurated = claimsReviewed && curatedPageIssues(sourcePage).length === 0;
    if (claimsReviewed && !reviewedCurated) quarantinedCuratedSlugs.push(slug);

    const page = normalizedPage(sourcePage, reviewedCurated);
    rendered.set(slug, render(page));
    if (reviewedCurated) {
      curatedCount += 1;
      curatedSlugs.push(slug);
    }
    else fallbackCount += 1;
  }

  if (rendered.size === 0) throw new Error('no eligible pages produced snapshots');

  if (requested) {
    for (const [slug, html] of rendered) {
      const directory = path.join(OUT_DIR, slug);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'index.html'), html, 'utf8');
    }
    console.log(`Snapshot generation complete: ${rendered.size} selected page(s).`);
    process.exit(0);
  }

  replaceOutput(rendered);
  const curatedOnlySlugs = curatedSourceSlugs.filter((slug) => !dbPages.has(slug));
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    dbSourceCount: dbPages.size,
    dbSlugs,
    curatedSourceCount: curatedPages.size,
    curatedSourceSlugs,
    curatedOnlyCount: curatedOnlySlugs.length,
    curatedOnlySlugs,
    sourceUnionCount: allSlugs.length,
    generatedCount: rendered.size,
    curatedCount,
    curatedSlugs,
    quarantinedCuratedSlugs,
    fallbackCount,
    slugs: [...rendered.keys()],
    pageSyncCount: syncManifest?.writtenCount ?? null,
  };
  if (manifest.generatedCount !== manifest.sourceUnionCount) {
    throw new Error(
      `coverage invariant failed: ${manifest.generatedCount} snapshots for ${manifest.sourceUnionCount} usable source slugs`
    );
  }
  if (manifest.curatedCount + manifest.fallbackCount !== manifest.generatedCount) {
    throw new Error('coverage invariant failed: curated and fallback counts do not cover every snapshot');
  }
  writeManifest(manifest);
  console.log(
    `Snapshot generation complete: ${rendered.size} generated ` +
      `(${curatedCount} curated, ${fallbackCount} guarded fallback, ` +
      `${quarantinedCuratedSlugs.length} curated source(s) quarantined), zero excluded.`
  );
} catch (error) {
  console.error(`Snapshot generation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
}
