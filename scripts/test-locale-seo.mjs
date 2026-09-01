#!/usr/bin/env node
/** Offline integration checks. Every generated file lives in an OS temp directory. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  SITE, SOURCE_DOCUMENT_PATHS, alternateLinks, assertSnapshotHead, isIndexable, loadLocaleSeoContext, localeSnapshotRecords,
  normalizeSnapshotHead, snapshotFile, verifyLocaleSnapshotCoverage,
} from './locale-seo.mjs';
import { assertLocalizedMainContent, generateLocalizedSnapshots, renderInsuranceContextSnapshot, refreshEnglishHomepageSections, renderLocalizedSnapshot, snapshotTranslator } from './generate-localized-snapshots.mjs';
import promotionPolicy from './pro-driver-promotion-guardrail.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fabsy-locale-seo-'));
let checks = 0;
const check = (name, run) => { run(); checks += 1; };
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const writeJson = (filename, value) => { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, JSON.stringify(value)); };
const clone = value => JSON.parse(JSON.stringify(value));

try {
  const registry = readJson(path.join(ROOT, 'src/i18n/locales.json'));
  const english = readJson(path.join(ROOT, 'src/i18n/locales/en.json'));
  const offers = readJson(path.join(ROOT, 'src/config/offers.json'));
  const options = {
    registryPath: path.join(temp, 'registry.json'), reviewPath: path.join(temp, 'review.json'),
    bundlesDir: path.join(temp, 'bundles'), offersPath: path.join(temp, 'offers.json'),
    sourceRoot: path.join(temp, 'legal-source'),
  };
  for (const filename of SOURCE_DOCUMENT_PATHS) {
    const target = path.join(options.sourceRoot, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, filename), target);
  }
  const review = { sourceVersion: registry.sourceVersion, locales: { en: { status: 'source' } }, contact: { whatsappNumber: null } };
  const prefixes = { pa: 'ਪੰਜਾਬੀ', tl: 'Salin', 'zh-hans': '简体中文', 'zh-hant': '繁體中文', ar: 'العربية', hi: 'हिन्दी', es: 'Español' };
  const fixtureTranslate = (value, code, key = '') => typeof value === 'string'
    ? key === 'metaTitle' ? `${prefixes[code]} fixture title` : key === 'metaDescription' ? `${prefixes[code]} offline fixture description.` : `${prefixes[code]} [OFFLINE FIXTURE] ${value}`
    : Object.fromEntries(Object.entries(value).map(([name, child]) => [name, fixtureTranslate(child, code, name)]));
  for (const locale of registry.locales.filter(item => item.wave <= 1)) {
    writeJson(path.join(options.bundlesDir, `${locale.code}.json`), locale.code === 'en' ? english : fixtureTranslate(english, locale.code));
    if (locale.code !== 'en') review.locales[locale.code] = { status: 'draft', reviewedBy: null, reviewedAt: null, sourceFingerprint: null, bundleFingerprint: null, serviceReady: false };
  }
  writeJson(options.registryPath, registry);
  writeJson(options.reviewPath, review);
  writeJson(options.offersPath, offers);
  const draft = loadLocaleSeoContext(options);
  const outDir = path.join(temp, 'source/prerendered');
  const publicDir = path.join(temp, 'public');
  const contentDir = path.join(temp, 'content-cache');
  const sitemapCuratedDir = path.join(temp, 'sitemap-curated');
  writeJson(path.join(contentDir, 'speeding-ticket-alberta.json'), {
    slug: 'speeding-ticket-alberta', city: 'Alberta', violation: 'Speeding',
    updated_at: '2026-09-01T00:18:27.000Z',
  });
  writeJson(path.join(sitemapCuratedDir, 'speeding-ticket-alberta.json'), {
    slug: 'speeding-ticket-alberta', reviewed_at: '2026-08-31',
  });
  writeJson(path.join(temp, 'blog-posts.json'), [
    {
      slug: 'fixture-blog',
      status: 'published',
      published_at: '2026-08-01T10:00:00.000Z',
      updated_at: '2026-08-03T10:00:00.000Z',
      reviewed_at: '2026-08-02T10:00:00.000Z',
    },
    {
      slug: 'demerit-points-speeding-ticket-alberta',
      status: 'published',
      published_at: '2026-08-01T10:00:00.000Z',
    },
  ]);
  const env = {
    ...process.env,
    LOCALE_REGISTRY_PATH: options.registryPath, LOCALE_REVIEW_PATH: options.reviewPath,
    LOCALE_BUNDLES_DIR: options.bundlesDir, LOCALE_OFFERS_PATH: options.offersPath,
    LOCALE_SOURCE_ROOT: options.sourceRoot,
    LOCALE_SNAPSHOT_OUT_DIR: outDir, PAGE_CONTENT_DIR: contentDir,
    SNAPSHOT_CURATED_DIR: path.join(temp, 'curated-empty'), SNAPSHOT_OUT_DIR: path.join(outDir, 'content'),
    SNAPSHOT_MANIFEST: path.join(outDir, 'content-manifest.json'),
    PAGE_SYNC_MANIFEST: path.join(temp, 'no-sync-manifest.json'), REQUIRE_PAGE_SYNC_MANIFEST: '0',
    PRERENDER_SRC_DIR: outDir, DIST_PRERENDER_DIR: path.join(temp, 'dist/prerendered'),
    SITEMAP_PUBLIC_DIR: publicDir, SITEMAP_BLOG_CACHE: path.join(temp, 'blog-posts.json'),
    CURATED_PAGE_DIR: sitemapCuratedDir,
  };
  fs.mkdirSync(env.SNAPSHOT_CURATED_DIR, { recursive: true });
  const run = (script, extraEnv = {}) => execFileSync(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, env: { ...env, ...extraEnv }, encoding: 'utf8', stdio: 'pipe', timeout: 30000 });
  run('scripts/generate-static-snapshots.cjs');
  const englishHtml = route => `<!doctype html><html lang="en-CA"><head><title>English fixture</title><meta name="description" content="Offline fixture description."><meta property="og:locale" content="en_CA"><link rel="canonical" href="${SITE}${route}"><meta name="robots" content="index, follow"></head><body><h1>Original English fixture for ${route}</h1>${route === '/' ? renderInsuranceContextSnapshot(snapshotTranslator(draft, 'en')) + promotionPolicy.renderProDriverSnapshot(offers, snapshotTranslator(draft, 'en'), 'en') : ''}</body></html>`;
  for (const route of draft.indexableRoutes) {
    if (route === '/terms-of-service') continue; // Exercise creation of the missing counterpart.
    const filename = snapshotFile(outDir, route);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, englishHtml(route));
  }

  check('English homepage refresh changes only identified sections and is idempotent', () => {
    const prefix = '<!doctype html><main><h1>Keep this exact English heading.</h1><!-- retain spacing -->\n';
    const suffix = '\n<section id="untouched"><p>Unchanged Rapid Resolution terms and other page content.</p></section></main>';
    const oldSection = '<section aria-labelledby="insurance-context-heading"><h2 id="insurance-context-heading">Earlier insurer context</h2><p>Earlier source wording.</p><ul><li>Aviva Canada</li></ul></section>';
    const updated = refreshEnglishHomepageSections(prefix + oldSection + suffix, draft);
    assert(updated.startsWith(prefix));
    assert(updated.endsWith(suffix));
    assert(updated.includes('Allstate Insurance'));
    assert(updated.includes('data-promotion="pro-driver-20"'));
    assert(updated.includes('$158.40') && updated.includes('$183.20'));
    assert(updated.includes('href="/pro-drivers"'));
    assert(!updated.includes('Earlier source wording.'));
    assert.equal(refreshEnglishHomepageSections(updated, draft), updated);
    const stalePromotion = updated.replace('$158.40', '$150.00');
    assert.equal(refreshEnglishHomepageSections(stalePromotion, draft), updated);
    for (const bad of [
      prefix + suffix,
      prefix + oldSection + oldSection + suffix,
      updated.replace('data-promotion="pro-driver-20"', 'data-promotion="unrecognized"'),
      updated.replace('data-promotion="pro-driver-20"', 'data-promotion="pro-driver-20" data-promotion="pro-driver-20"'),
      updated.replace('</section><section data-promotion', '</section><p>Intervening unrelated content</p><section data-promotion'),
      updated.replace('</section>', ''),
    ]) assert.throws(() => refreshEnglishHomepageSections(bad, draft), /marker|immediately follow/);
  });

  check('only actual Phase 1 translated routes enter the snapshot inventory', () => {
    const records = localeSnapshotRecords(draft);
    assert.equal(records.length, 56);
    assert(!records.some(record => /content|blog|thank-you|terms-of-purchase|ticket-form/.test(record.route)));
    assert(!records.some(record => record.indexable));
    assert.deepEqual(alternateLinks(draft, 'en', '/').map(link => link.languageTag), ['en', 'x-default']);
    assert.deepEqual(alternateLinks(draft, 'pa', '/'), []);
  });
  check('the distinct English purchase agreement remains indexable without invented translations', () => {
    assert.equal(isIndexable(draft, 'en', '/terms-of-purchase'), true);
    assert.equal(isIndexable(draft, 'pa', '/terms-of-purchase'), false);
    assert.deepEqual(alternateLinks(draft, 'en', '/terms-of-purchase'), [
      { languageTag: 'en', href: `${SITE}/terms-of-purchase` },
      { languageTag: 'x-default', href: `${SITE}/terms-of-purchase` },
    ]);
    assert.throws(() => normalizeSnapshotHead(englishHtml('/pa/terms-of-purchase'), '/pa/terms-of-purchase', draft), /No translated snapshot/);
    assert(SOURCE_DOCUMENT_PATHS.includes('src/pages/TermsOfPurchase.tsx'));
  });
  const draftManifest = generateLocalizedSnapshots({ context: draft, outDir });
  check('all localized homes include insurer context then the exact verified promotion, without adding routes', () => {
    for (const record of draftManifest.records) {
      const html = fs.readFileSync(snapshotFile(outDir, record.route), 'utf8');
      assert.equal(html.includes('data-promotion="pro-driver-20"'), record.basePath === '/');
      if (record.basePath !== '/') continue;
      assert(html.indexOf('insurance-context-heading') < html.indexOf('data-promotion="pro-driver-20"'));
      assert(html.includes('Allstate Insurance'));
      assert(html.includes('$158.40') && html.includes('$183.20'));
      assert(html.includes('href="/pro-drivers"'));
      assert(!html.includes(`href="/${record.code}/pro-drivers"`));
    }
    assert(!draftManifest.records.some(record => record.route.includes('pro-drivers')));
  });
  check('ambiguous English homepage input cannot partially replace locale output', () => {
    const homeFile = snapshotFile(outDir, '/');
    const home = fs.readFileSync(homeFile, 'utf8');
    const before = fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8');
    const manifest = fs.readFileSync(path.join(outDir, 'locale-manifest.json'), 'utf8');
    try {
      fs.writeFileSync(homeFile, home.replace('aria-labelledby="insurance-context-heading"', 'aria-labelledby="missing"'));
      assert.throws(() => generateLocalizedSnapshots({ context: draft, outDir }), /insurance-context marker/);
      assert.equal(fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8'), before);
      assert.equal(fs.readFileSync(path.join(outDir, 'locale-manifest.json'), 'utf8'), manifest);
    } finally { fs.writeFileSync(homeFile, home); }
  });
  check('draft pages have translated headings, script tags, RTL, self canonicals and noindex', () => {
    assert.equal(verifyLocaleSnapshotCoverage(outDir, draft).generatedCount, 56);
    for (const record of draftManifest.records) {
      const html = fs.readFileSync(snapshotFile(outDir, record.route), 'utf8');
      assertSnapshotHead(html, record.route, draft);
      assertLocalizedMainContent(html, draft, record.code, record.basePath);
      assert.match(html, /name="robots" content="noindex, nofollow"/);
      assert(!html.includes('hreflang='));
      assert(!html.includes('property="og:locale"'));
      assert(!html.includes('content="en_CA"'));
      assert(!html.includes('{{'));
    }
    assert.match(fs.readFileSync(snapshotFile(outDir, '/ar/'), 'utf8'), /lang="ar" dir="rtl"/);
    assert.match(fs.readFileSync(snapshotFile(outDir, '/zh-hant/'), 'utf8'), /lang="zh-Hant"/);
    assert(!fs.existsSync(snapshotFile(outDir, '/pa/thank-you')));
    assert(!fs.existsSync(snapshotFile(outDir, '/pa/content/speeding-ticket-alberta')));
  });
  check('localized head normalization removes the inherited English Open Graph locale', () => {
    const localized = normalizeSnapshotHead(englishHtml('/pa/'), '/pa/', draft);
    assert(!localized.includes('property="og:locale"'));
    assert(!localized.includes('content="en_CA"'));
    assertSnapshotHead(localized, '/pa/', draft);
    const englishHead = normalizeSnapshotHead(englishHtml('/'), '/', draft);
    assert.equal([...englishHead.matchAll(/property="og:locale"/g)].length, 1);
    assert(englishHead.includes('<meta property="og:locale" content="en_CA">'));
    assertSnapshotHead(englishHead, '/', draft);
    assert.throws(
      () => assertSnapshotHead(localized.replace('</head>', '<meta property="og:locale" content="en_CA"></head>'), '/pa/', draft),
      /inherited an English Open Graph locale/,
    );
  });
  check('English terms counterpart has substantive terms without localized explanatory notices', () => {
    const html = fs.readFileSync(snapshotFile(outDir, '/terms-of-service'), 'utf8');
    assert.match(html, /<h1>Terms of Service<\/h1>/);
    assert(!html.includes(english.terms.intro));
    assert(!html.includes(english.terms.englishControls));
    assert(html.includes('10. Cancellation, refunds and termination'));
  });

  const approvedReview = clone(review);
  approvedReview.locales.pa = {
    status: 'approved', reviewedBy: 'Offline fixture reviewer (not a real approval)', reviewedAt: '2026-08-30T00:00:00Z',
    sourceFingerprint: draft.sourceFingerprint, bundleFingerprint: draft.bundleFingerprints.pa, serviceReady: true,
    sourceDocuments: draft.sourceDocuments,
  };
  writeJson(options.reviewPath, approvedReview);
  const approved = loadLocaleSeoContext(options);
  check('approval requires review identity, exact source/bundle fingerprints and service readiness', () => {
    assert(approved.released('pa'));
    assert(approved.indexable('pa'));
    assert(!approved.released('tl'));
    assert(!approved.indexable('tl'));
    for (const change of [{ reviewedBy: null }, { reviewedAt: 'invalid' }, { serviceReady: false }, { status: 'draft' }, { sourceFingerprint: 'stale' }, { bundleFingerprint: 'stale' }]) {
      const candidate = clone(approvedReview);
      Object.assign(candidate.locales.pa, change);
      writeJson(options.reviewPath, candidate);
      assert.equal(loadLocaleSeoContext(options).released('pa'), false);
    }
    writeJson(options.reviewPath, approvedReview);
    writeJson(options.offersPath, { ...offers, rapidResolution: { ...offers.rapidResolution, priceCad: offers.rapidResolution.priceCad + 1 } });
    assert.equal(loadLocaleSeoContext(options).released('pa'), false);
    writeJson(options.offersPath, offers);
    writeJson(path.join(options.bundlesDir, 'en.json'), { ...english, _fixtureSourceChange: true });
    assert.equal(loadLocaleSeoContext(options).released('pa'), false);
    writeJson(path.join(options.bundlesDir, 'en.json'), english);
    const pa = readJson(path.join(options.bundlesDir, 'pa.json'));
    writeJson(path.join(options.bundlesDir, 'pa.json'), { ...pa, _fixtureBundleChange: true });
    assert.equal(loadLocaleSeoContext(options).released('pa'), false);
    writeJson(path.join(options.bundlesDir, 'pa.json'), pa);
    for (const documentPath of SOURCE_DOCUMENT_PATHS) {
      const termsFile = path.join(options.sourceRoot, documentPath);
      const originalTerms = fs.readFileSync(termsFile, 'utf8');
      fs.writeFileSync(termsFile, originalTerms + '\n// Isolated source-document drift fixture\n');
      assert.equal(loadLocaleSeoContext(options).released('pa'), false, documentPath);
      fs.writeFileSync(termsFile, originalTerms);
    }
  });
  generateLocalizedSnapshots({ context: approved, outDir });
  const approvedPaHtml = fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8');
  check('approved locale has six indexable pages and reciprocal links; private routes stay noindex', () => {
    const manifest = verifyLocaleSnapshotCoverage(outDir, approved);
    assert.equal(manifest.records.filter(record => record.indexable).length, 6);
    assert.deepEqual(alternateLinks(approved, 'pa', '/faq'), alternateLinks(approved, 'en', '/faq'));
    assert.deepEqual(alternateLinks(approved, 'pa', '/faq').map(link => link.languageTag), ['en', 'pa', 'x-default']);
    assert.deepEqual(alternateLinks(approved, 'en', '/content/speeding-ticket-alberta').map(link => link.languageTag), ['en', 'x-default']);
    for (const route of ['/pa/submit-ticket', '/pa/payment-canceled']) {
      assert.match(fs.readFileSync(snapshotFile(outDir, route), 'utf8'), /noindex, nofollow/);
    }
    assert(!approvedPaHtml.includes('https://wa.me/'));
  });
  check('approval cannot ship without an indexable English counterpart', () => {
    const filename = snapshotFile(outDir, '/contact');
    const html = fs.readFileSync(filename, 'utf8');
    fs.rmSync(filename);
    assert.throws(() => verifyLocaleSnapshotCoverage(outDir, approved), /English counterpart/);
    fs.writeFileSync(filename, html.replace('index, follow', 'noindex, nofollow'));
    assert.throws(() => verifyLocaleSnapshotCoverage(outDir, approved), /indexable English counterpart/);
    fs.writeFileSync(filename, html);
  });
  check('regeneration preserves an existing English terms body', () => {
    const filename = snapshotFile(outDir, '/terms-of-service');
    const html = fs.readFileSync(filename, 'utf8') + '\n<!-- Preserve existing English terms -->';
    fs.writeFileSync(filename, html);
    generateLocalizedSnapshots({ context: approved, outDir });
    assert.equal(fs.readFileSync(filename, 'utf8'), html);
  });
  run('scripts/generate-sitemap-from-db.js');
  // Complete the English browser fixture inventory from the generated XML so
  // the existing full-tree guardrail check can run entirely in isolation.
  for (const name of fs.readdirSync(path.join(publicDir, 'sitemaps'))) {
    const xml = fs.readFileSync(path.join(publicDir, 'sitemaps', name), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const route = new URL(match[1]).pathname;
      const filename = snapshotFile(outDir, route);
      if (!fs.existsSync(filename)) {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, englishHtml(route));
      }
    }
  }
  check('locale sitemap publishes only approved equivalent surfaces', () => {
    const index = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    const pa = fs.readFileSync(path.join(publicDir, 'sitemaps/sitemap-pa.xml'), 'utf8');
    assert(index.includes('/sitemaps/sitemap-pa.xml'));
    assert(!index.includes('/sitemaps/sitemap-tl.xml'));
    assert.equal([...pa.matchAll(/<loc>/g)].length, 6);
    assert(!/\/content\/|\/blog\/|submit-ticket|payment-canceled|thank-you|terms-of-purchase/.test(pa));
    assert(pa.includes('hreflang="en"') && pa.includes('hreflang="pa"') && pa.includes('hreflang="x-default"'));
    const pages = fs.readFileSync(path.join(publicDir, 'sitemaps/sitemap-pages.xml'), 'utf8');
    assert(pages.includes(`<loc>${SITE}/terms-of-purchase</loc>`));
    assert(pages.includes('<lastmod>2026-08-03T10:00:00.000Z</lastmod>'));
    assert(!pages.includes('/blog/demerit-points-speeding-ticket-alberta'));
    const content = fs.readFileSync(path.join(publicDir, 'sitemaps/sitemap-content.xml'), 'utf8');
    assert(content.includes('<lastmod>2026-08-31</lastmod>'));
    assert(!content.includes('<lastmod>2026-09-01T00:18:27.000Z</lastmod>'));
    assert(!content.includes('hreflang="pa"'));
  });
  check('existing full-tree guardrails accept intentional previews and locale-root slashes', () => {
    run('scripts/validate-snapshot-guardrails.cjs', { VALIDATE_ALL_PRERENDERED: '1' });
    const forbidden = path.join(publicDir, 'sitemaps/sitemap-forbidden-preview.xml');
    fs.writeFileSync(forbidden, `<urlset><url><loc>${SITE}/tl/</loc></url></urlset>`);
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate-snapshot-guardrails.cjs')], { cwd: ROOT, env: { ...env, VALIDATE_ALL_PRERENDERED: '1' }, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /noindex snapshot is represented in a sitemap/);
    fs.rmSync(forbidden);
  });
  check('catalog admission never exempts injected English or native-language price claims', () => {
    for (const [route, claim] of [['/pa/', 'Guaranteed withdrawal for $999 CAD.'], ['/ar/', 'رسوم إضافية بقيمة $999 CAD.']]) {
      const filename = snapshotFile(outDir, route);
      const original = fs.readFileSync(filename, 'utf8');
      fs.writeFileSync(filename, original.replace('</main>', `<p>${claim}</p></main>`));
      const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate-snapshot-guardrails.cjs')], { cwd: ROOT, env: { ...env, VALIDATE_ALL_PRERENDERED: '1' }, encoding: 'utf8', timeout: 30000 });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /unsupported monetary legal claim/);
      fs.writeFileSync(filename, original);
    }
  });
  run('scripts/copy-prerendered.js');
  check('release copy refreshes reciprocal English SEO without rewriting its body', () => {
    const original = fs.readFileSync(snapshotFile(outDir, '/'), 'utf8');
    const copied = fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/'), 'utf8');
    assert(!original.includes('hreflang='));
    assert(copied.includes('hreflang="pa" href="https://fabsy.ca/pa/"'));
    assert.equal(copied.match(/<body>[\s\S]*<\/body>/)[0], original.match(/<body>[\s\S]*<\/body>/)[0]);
    const purchase = fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/terms-of-purchase'), 'utf8');
    assert.match(purchase, /name="robots" content="index, follow"/);
    assert(!purchase.includes('hreflang="pa"'));
    verifyLocaleSnapshotCoverage(env.DIST_PRERENDER_DIR, approved);
  });
  check('copy rejects stale English and changed localized promotions before touching prior output', () => {
    for (const [route, mutation] of [
      ['/', html => html.replace('$158.40', '$150.00')],
      ['/pa/', html => html.replace('$183.20', '$183.21')],
      ['/ar/', html => html.replace('href="/pro-drivers"', 'href="/ar/pro-drivers"')],
    ]) {
      const filename = snapshotFile(outDir, route);
      const original = fs.readFileSync(filename, 'utf8');
      const previous = fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, route), 'utf8');
      try {
        fs.writeFileSync(filename, mutation(original));
        const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/copy-prerendered.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /promotion|Pro Driver/);
        assert.equal(fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, route), 'utf8'), previous);
      } finally { fs.writeFileSync(filename, original); }
    }
  });
  check('withdrawing approval rejects stale artifacts without touching prior output', () => {
    writeJson(options.reviewPath, review);
    const before = fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/'), 'utf8');
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/copy-prerendered.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Localized snapshots are stale/);
    assert.equal(fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/'), 'utf8'), before);
  });
  generateLocalizedSnapshots({ context: draft, outDir });
  fs.writeFileSync(path.join(publicDir, 'sitemaps/sitemap-fr.xml'), '<stale/>');
  run('scripts/generate-sitemap-from-db.js');
  run('scripts/copy-prerendered.js');
  check('withdrawing approval removes locale sitemap files, index references and English alternates', () => {
    assert(!fs.existsSync(path.join(publicDir, 'sitemaps/sitemap-pa.xml')));
    assert(!fs.existsSync(path.join(publicDir, 'sitemaps/sitemap-fr.xml')));
    assert(!fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8').includes('/sitemap-pa.xml'));
    assert(!fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/'), 'utf8').includes('hreflang="pa"'));
  });
  check('untranslated duplicates, invented routes and noindex removal fail validation', () => {
    const extra = snapshotFile(outDir, '/pa/content/english-copy');
    fs.mkdirSync(path.dirname(extra), { recursive: true });
    fs.writeFileSync(extra, englishHtml('/pa/content/english-copy'));
    assert.throws(() => verifyLocaleSnapshotCoverage(outDir, draft), /unregistered routes/);
    fs.rmSync(path.join(outDir, 'pa/content'), { recursive: true });
    const route = '/pa/submit-ticket';
    const filename = snapshotFile(outDir, route);
    const original = fs.readFileSync(filename, 'utf8');
    fs.writeFileSync(filename, original.replace('content="noindex, nofollow"', 'content="index, follow"'));
    assert.throws(() => verifyLocaleSnapshotCoverage(outDir, draft), /private snapshot is indexable/);
    fs.writeFileSync(filename, original);
    assert.throws(() => assertLocalizedMainContent(englishHtml('/pa/'), draft, 'pa', '/'), /main heading/);
    assert.throws(() => normalizeSnapshotHead(englishHtml('/pa/content/english-copy'), '/pa/content/english-copy', draft), /No translated snapshot/);
  });
  check('missing translation keys stop generation before replacing any output', () => {
    const broken = { ...draft, bundles: { ...draft.bundles, pa: clone(draft.bundles.pa) } };
    delete broken.bundles.pa.common.noOutcomePromise;
    const before = fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8');
    assert.throws(() => generateLocalizedSnapshots({ context: broken, outDir }), /Missing translated snapshot string/);
    assert.equal(fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8'), before);
  });

  // Owner-authorized machine publication is a separate state from native
  // review. These temporary fixtures never alter the production attestation.
  const publishedReview = clone(review);
  for (const locale of registry.locales.filter(item => item.wave === 1)) {
    publishedReview.locales[locale.code] = {
      ...publishedReview.locales[locale.code], status: 'published',
      publication: {
        basis: 'owner_authorized_machine_translation',
        authorizedBy: 'Brett Bilon',
        authorizedAt: '2026-08-30T00:00:00Z',
        indexingAuthorizedBy: 'Brett Bilon',
        indexingAuthorizedAt: '2026-09-01T00:00:00Z',
        disclaimerVersion: 'not-legal-advice-machine-translation-v1',
      },
      sourceFingerprint: draft.sourceFingerprint, bundleFingerprint: draft.bundleFingerprints[locale.code],
      sourceDocuments: draft.sourceDocuments,
    };
  }
  writeJson(options.reviewPath, publishedReview);
  const published = loadLocaleSeoContext(options);
  check('owner indexing authorization is explicit and fails closed without every attestation field', () => {
    for (const [name, change] of [
      ['missing indexing owner', { indexingAuthorizedBy: undefined }],
      ['empty indexing owner', { indexingAuthorizedBy: '   ' }],
      ['missing indexing date', { indexingAuthorizedAt: undefined }],
      ['invalid indexing date', { indexingAuthorizedAt: 'not-a-date' }],
      ['missing disclaimer version', { disclaimerVersion: undefined }],
      ['wrong disclaimer version', { disclaimerVersion: 'some-other-disclaimer' }],
    ]) {
      const candidate = clone(publishedReview);
      Object.assign(candidate.locales.pa.publication, change);
      writeJson(options.reviewPath, candidate);
      const context = loadLocaleSeoContext(options);
      assert.equal(context.released('pa'), true, `${name} must not withdraw the owner-published interface`);
      assert.equal(context.indexable('pa'), false, `${name} must keep the interface out of search`);
    }
    writeJson(options.reviewPath, publishedReview);
  });
  const publishedManifest = generateLocalizedSnapshots({ context: published, outDir });
  const publishedPaHtml = fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8');
  const machineNotice = /<aside\b[^>]*data-translation-status="machine-translated"[^>]*>[\s\S]*?<\/aside>/;
  check('seven explicitly index-authorized machine translations publish public routes without claiming native review', () => {
    const expectedAlternates = ['en', 'pa', 'tl', 'zh-Hans', 'zh-Hant', 'ar', 'hi', 'es', 'x-default'];
    assert.equal(publishedManifest.records.filter(record => record.indexable).length, 42);
    assert.equal(publishedManifest.records.filter(record => !record.indexable).length, 14);
    for (const record of publishedManifest.records) {
      const entry = published.review.locales[record.code];
      assert.equal(entry.reviewedBy, null);
      assert.equal(entry.reviewedAt, null);
      assert.equal(entry.serviceReady, false);
      assert(published.released(record.code));
      assert.equal(published.indexable(record.code), true);
      assert.equal(record.indexable, published.indexableRoutes.has(record.basePath));
      const html = fs.readFileSync(snapshotFile(outDir, record.route), 'utf8');
      assertSnapshotHead(html, record.route, published);
      assertLocalizedMainContent(html, published, record.code, record.basePath);
      assert.match(html, machineNotice);
      assert(!html.includes(published.bundles[record.code].language.draftTitle));
      assert(!html.includes('property="og:locale"'));
      if (record.indexable) {
        assert.match(html, /name="robots" content="index, follow"/);
        assert.deepEqual(alternateLinks(published, record.code, record.basePath).map(link => link.languageTag), expectedAlternates);
      } else {
        assert.match(html, /name="robots" content="noindex, nofollow"/);
        assert.deepEqual(alternateLinks(published, record.code, record.basePath), []);
      }
    }
    assert.deepEqual(alternateLinks(published, 'en', '/faq').map(link => link.languageTag), expectedAlternates);
    assert(!approvedPaHtml.includes('data-translation-status="machine-translated"'));
    assert(!publishedPaHtml.includes('https://wa.me/'));
  });
  run('scripts/generate-sitemap-from-db.js');
  run('scripts/validate-snapshot-guardrails.cjs', { VALIDATE_ALL_PRERENDERED: '1' });
  run('scripts/copy-prerendered.js');
  check('index-authorized machine publication creates seven locale sitemaps and reciprocal hreflang', () => {
    const index = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    for (const locale of registry.locales.filter(item => item.wave === 1)) {
      const name = `sitemap-${locale.code}.xml`;
      assert(index.includes(`/sitemaps/${name}`));
      const sitemap = fs.readFileSync(path.join(publicDir, 'sitemaps', name), 'utf8');
      assert.equal([...sitemap.matchAll(/<loc>/g)].length, 6);
      for (const languageTag of ['en', 'pa', 'tl', 'zh-Hans', 'zh-Hant', 'ar', 'hi', 'es', 'x-default']) {
        assert(sitemap.includes(`hreflang="${languageTag}"`), `${name} missing ${languageTag}`);
      }
      assert(!/\/content\/|\/blog\/|submit-ticket|payment-canceled|thank-you|terms-of-purchase/.test(sitemap));
    }
    for (const route of published.indexableRoutes) {
      const html = fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, route), 'utf8');
      assertSnapshotHead(html, route, published);
      for (const languageTag of ['en', 'pa', 'tl', 'zh-Hans', 'zh-Hant', 'ar', 'hi', 'es', 'x-default']) {
        assert(html.includes(`hreflang="${languageTag}"`), `${route} missing ${languageTag}`);
      }
    }
    assert(!fs.readFileSync(path.join(publicDir, 'sitemaps/sitemap-content.xml'), 'utf8').includes('hreflang="pa"'));
    verifyLocaleSnapshotCoverage(env.DIST_PRERENDER_DIR, published);
  });
  check('copy refuses missing, altered or duplicated machine disclosure before replacing output', () => {
    const filename = snapshotFile(outDir, '/pa/');
    const before = fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/pa/'), 'utf8');
    for (const replacement of ['', '<aside data-translation-status="machine-translated">Native-reviewed translation.</aside>', '$&$&']) {
      try {
        const changed = publishedPaHtml.replace(machineNotice, replacement);
        assert.notEqual(changed, publishedPaHtml);
        fs.writeFileSync(filename, changed);
        assert.throws(() => assertLocalizedMainContent(changed, published, 'pa', '/'), /translation disclosure/);
        const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/copy-prerendered.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /translation disclosure/);
        assert.equal(fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/pa/'), 'utf8'), before);
      } finally {
        fs.writeFileSync(filename, publishedPaHtml);
      }
    }
  });
  check('withdrawing owner publication rejects stale public artifacts', () => {
    writeJson(options.reviewPath, review);
    assert.throws(() => verifyLocaleSnapshotCoverage(outDir, loadLocaleSeoContext(options)), /Localized snapshots are stale/);
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/copy-prerendered.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Localized snapshots are stale/);
  });
  generateLocalizedSnapshots({ context: draft, outDir });
  run('scripts/generate-sitemap-from-db.js');
  run('scripts/copy-prerendered.js');
  check('withdrawn publication restores noindex and removes every localized sitemap', () => {
    for (const locale of registry.locales.filter(item => item.wave === 1)) {
      assert(!fs.existsSync(path.join(publicDir, 'sitemaps', `sitemap-${locale.code}.xml`)));
    }
    assert.match(fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8'), /noindex, nofollow/);
    assert(!fs.readFileSync(snapshotFile(env.DIST_PRERENDER_DIR, '/'), 'utf8').includes('hreflang="pa"'));
  });

  // Use the real catalogs here: the prefixed synthetic translations above do
  // not reproduce a shared, untranslated product name in a browser price card.
  // The captured fragments exercise the CLI, manifest and legal-source gates,
  // not a helper with artificially admitted strings.
  const browserFixture = readJson(path.join(ROOT, 'scripts/fixtures/locale-browser-fragments.json'));
  // Keep the historical browser fragment paired with its original dynamic
  // date source. The new fixed source date and added terms have independent
  // actual-React and mutation coverage in test-public-offer-snapshot-guardrails.
  const browserSourceRoot = path.join(temp, 'captured-browser-legal-source');
  fs.cpSync(options.sourceRoot, browserSourceRoot, { recursive: true });
  const browserTermsSource = path.join(browserSourceRoot, 'src/pages/TermsOfService.tsx');
  const currentTermsSource = fs.readFileSync(browserTermsSource, 'utf8');
  fs.writeFileSync(browserTermsSource, currentTermsSource.replace('Last updated: August 31, 2026', 'Last updated: {new Date().toLocaleDateString()}'));
  const browserOptions = { ...options, sourceRoot: browserSourceRoot, bundlesDir: path.join(ROOT, 'src/i18n/locales') };
  const browserContext = loadLocaleSeoContext(browserOptions);
  const browserDir = path.join(temp, 'browser/prerendered');
  fs.cpSync(outDir, browserDir, { recursive: true });
  generateLocalizedSnapshots({ context: browserContext, outDir: browserDir });
  const browserEnv = {
    LOCALE_SOURCE_ROOT: browserSourceRoot,
    LOCALE_BUNDLES_DIR: browserOptions.bundlesDir,
    LOCALE_SNAPSHOT_OUT_DIR: browserDir,
    SNAPSHOT_OUT_DIR: path.join(browserDir, 'content'),
    SNAPSHOT_MANIFEST: path.join(browserDir, 'content-manifest.json'),
    VALIDATE_ALL_PRERENDERED: '1',
  };
  for (const locale of registry.locales.filter(item => item.wave === 1)) {
    for (const base of ['/', '/rapid-resolution']) {
      const filename = snapshotFile(browserDir, `/${locale.code}${base}`);
      const original = fs.readFileSync(filename, 'utf8');
      fs.writeFileSync(filename, original.replace('</main>', `${browserFixture.priceCard}</main>`));
    }
  }
  const termsFilename = snapshotFile(browserDir, '/terms-of-service');
  const termsOriginal = fs.readFileSync(termsFilename, 'utf8');
  const termsBody = `${browserFixture.termsHeadingAndDate}${browserFixture.termsClauses.join('')}`;
  const capturedTerms = termsOriginal.replace(/<main\b[^>]*>[\s\S]*?<\/main>/, `<main>${termsBody}</main>`);
  assert.notEqual(capturedTerms, termsOriginal);
  fs.writeFileSync(termsFilename, capturedTerms);
  check('real browser price cards and authoritative English terms pass together', () => {
    run('scripts/validate-snapshot-guardrails.cjs', browserEnv);
  });
  const rejectBrowserMutation = (name, route, mutate, issue) => {
    const filename = snapshotFile(browserDir, route);
    const original = fs.readFileSync(filename, 'utf8');
    const changed = mutate(original);
    assert.notEqual(changed, original, `fixture mutation did not apply: ${name}`);
    try {
      fs.writeFileSync(filename, changed);
      const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate-snapshot-guardrails.cjs')], {
        cwd: ROOT, env: { ...env, ...browserEnv }, encoding: 'utf8', timeout: 30000,
      });
      assert.notEqual(result.status, 0, `${name} must fail the full-tree guardrail`);
      assert.match(result.stderr, issue, name);
    } finally {
      fs.writeFileSync(filename, original);
    }
  };
  check('preserving product identity does not admit unknown or different product prices', () => {
    for (const [name, amount] of [['unknown amount', '$999'], ['report amount on rapid card', '$49']]) {
      rejectBrowserMutation(name, '/pa/', html => html.replace(browserFixture.priceCard, browserFixture.priceCard.replace('$198', amount)), /unsupported monetary legal claim/);
    }
  });
  check('English source admissions require the complete unaltered visible clause', () => {
    const cases = [
      ['wrong report amount', '$49 CAD', '$198 CAD'],
      ['wrong report cents', '$49 CAD', '$49.01 CAD'],
      ['wrong report product', 'The standalone report is', 'The court fine is'],
      ['wrong currency', '$49 CAD', '$49 USD'],
      ['missing currency', '$49 CAD', '$49'],
      ['missing GST', '$49 CAD plus applicable GST', '$49 CAD'],
      ['inclusive GST', '$49 CAD plus applicable GST', '$49 CAD including GST'],
      ['fine appended to report', '$49 CAD plus applicable GST</li>', '$49 CAD plus applicable GST, the statutory fine for speeding</li>'],
      ['savings appended to bundle', '$229 CAD plus applicable GST</li>', '$229 CAD plus applicable GST in annual insurance savings</li>'],
      ['inline alteration', '$49 CAD', '<span>$49</span> CAD'],
      ['different service clock', 'The 48-hour commitment begins', 'The 24-hour commitment begins'],
      ['payment starts clock', 'complete, readable disclosure is received and matched to your file', 'payment is received'],
      ['Crown timing appended', 'received and matched to your file</li>', 'received and matched to your file, including Crown response time</li>'],
      ['outcome promise substituted', 'The 48-hour service commitment is not an outcome promise.', 'The 48-hour service commitment is an outcome promise.'],
    ];
    for (const [name, original, changed] of cases) {
      rejectBrowserMutation(name, '/terms-of-service', html => html.replace(original, changed), /unsupported monetary legal claim|duration or deadline claim/);
    }
  });
  check('only a valid date immediately after the first terms heading is metadata', () => {
    const dateNode = /<p\b[^>]*>Last updated: 8\/30\/2026<\/p>/;
    const cases = [
      ['invalid calendar date', html => html.replace('Last updated: 8/30/2026', 'Last updated: 2/30/2026')],
      ['deadline label', html => html.replace('Last updated: 8/30/2026', 'Response deadline: 8/30/2026')],
      ['extra text in date', html => html.replace('Last updated: 8/30/2026', 'Last updated: 8/30/2026. Effective on this date.')],
      ['same date in a deadline', html => html.replace('</main>', '<p>Your court deadline is 8/30/2026.</p></main>')],
      ['date moved to body', html => html.replace(dateNode, '').replace('</main>', '<p>Last updated: 8/30/2026</p></main>')],
      ['second heading cannot qualify', html => html.replace(/<main\b[^>]*>/, '<main><h1>Terms of Service</h1><p>Agreement introduction.</p>')],
    ];
    for (const [name, mutate] of cases) rejectBrowserMutation(name, '/terms-of-service', mutate, /numeric date claim/);
    for (const [name, fragment, issue] of [
      ['terms clause on another route', browserFixture.termsClauses[0], /unsupported monetary legal claim/],
      ['terms metadata on another route', browserFixture.termsHeadingAndDate, /numeric date claim/],
    ]) {
      rejectBrowserMutation(name, '/contact', html => html.replace('</body>', `${fragment}</body>`), issue);
    }
  });

  async function importFunction(relative) {
    const compiled = await build({ entryPoints: [path.join(ROOT, relative)], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
    return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  }
  const middleware = await importFunction('functions/_middleware.ts');
  let assetRequests = 0;
  const responseFor = (pathname, html, userAgent = 'Googlebot') => middleware.onRequest({
    request: new Request(`${SITE}${pathname}`, { headers: { 'User-Agent': userAgent } }),
    env: { ASSETS: { fetch: async () => { assetRequests += 1; return new Response(html, { headers: { 'X-Robots-Tag': 'noindex, nofollow' } }); } } },
    next: async () => new Response(englishHtml('/'), { headers: { 'X-Prerendered': 'stale' } }),
  });
  const paDraftHtml = fs.readFileSync(snapshotFile(outDir, '/pa/'), 'utf8');
  const draftResponse = await responseFor('/pa/', paDraftHtml);
  const slashlessResponse = await responseFor('/pa', paDraftHtml);
  const approvedResponse = await responseFor('/pa/', approvedPaHtml);
  const publishedResponse = await responseFor('/pa/', publishedPaHtml);
  const englishResponse = await responseFor('/', englishHtml('/'));
  check('crawler middleware preserves draft noindex and serves index-authorized machine publications', () => {
    assert.equal(draftResponse.headers.get('X-Prerendered'), 'true');
    assert.equal(draftResponse.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(draftResponse.headers.get('Content-Language'), 'pa');
    assert.equal(slashlessResponse.headers.get('X-Prerendered'), 'true');
    assert.equal(approvedResponse.headers.get('X-Robots-Tag'), 'index, follow');
    assert.equal(publishedResponse.headers.get('X-Robots-Tag'), 'index, follow');
    assert.equal(publishedResponse.headers.get('Content-Language'), 'pa');
    assert.equal(englishResponse.headers.get('X-Robots-Tag'), 'index, follow');
  });
  const crawlerResponses = await Promise.all(
    ['Googlebot', 'bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User']
      .map(async (userAgent) => [userAgent, await responseFor('/', englishHtml('/'), userAgent)]),
  );
  check('search and answer crawlers receive the canonical prerendered document', () => {
    for (const [userAgent, response] of crawlerResponses) {
      assert.equal(response.status, 200, userAgent);
      assert.equal(response.headers.get('X-Prerendered'), 'true', userAgent);
      assert.equal(response.headers.get('X-Robots-Tag'), 'index, follow', userAgent);
    }
  });
  const shellResponse = await responseFor('/pa/', englishHtml('/'));
  const wrongLanguage = await responseFor('/pa/', englishHtml('/pa/'));
  assetRequests = 0;
  const unsupported = await responseFor('/pa/content/english-copy', englishHtml('/pa/content/english-copy'));
  const privateReceipt = await responseFor('/pa/thank-you', englishHtml('/pa/thank-you'));
  const purchaseHandoff = await responseFor('/ar/terms-of-purchase?source=fixture', englishHtml('/ar/terms-of-purchase'));
  check('missing, untranslated and unsupported locale snapshots never masquerade as indexable HTML', () => {
    for (const response of [shellResponse, wrongLanguage, unsupported, privateReceipt, purchaseHandoff]) {
      assert.equal(response.headers.get('X-Prerendered'), null);
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    }
    assert.equal(assetRequests, 0);
  });
  const alias = await responseFor('/ar/ticket-form?source=fixture', 'unused', 'Mozilla/5.0');
  check('localized aliases preserve locale and query strings without language redirects', () => {
    assert.equal(alias.status, 301);
    assert.equal(alias.headers.get('Location'), `${SITE}/ar/submit-ticket?source=fixture`);
  });
  const consolidated = await responseFor('/blog/demerit-points-speeding-ticket-alberta?source=fixture', 'unused', 'Mozilla/5.0');
  const retired = await responseFor('/blog/driving-without-licence-alberta-penalties', 'unused', 'Googlebot');
  check('SEO route policies preserve queries and retire unsupported duplicates', () => {
    assert.equal(consolidated.status, 301);
    assert.equal(consolidated.headers.get('Location'), `${SITE}/content/demerit-points-alberta?source=fixture`);
    assert.equal(retired.status, 410);
    assert.equal(retired.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  });
  const purchaseForHuman = await responseFor('/ar/terms-of-purchase?source=fixture', 'unused', 'Mozilla/5.0');
  check('untranslated purchase terms leave the English handoff to the app without redirecting to a different agreement', () => {
    assert.equal(purchaseForHuman.status, 200);
    assert.equal(purchaseForHuman.headers.get('Location'), null);
    assert.equal(assetRequests, 0);
  });
  const languageEndpoint = await importFunction('functions/api/language.ts');
  const languageResponse = await languageEndpoint.onRequestGet({ request: new Request(`${SITE}/api/language`, { headers: { 'Accept-Language': 'en;q=0.4,pa-IN;q=0.8' } }) });
  const detected = await languageResponse.json();
  check('Accept-Language is a private, uncached preference hint without a redirect', () => {
    assert.equal(detected.locale, 'pa');
    assert.equal(languageResponse.status, 200);
    assert.equal(languageResponse.headers.get('Vary'), 'Accept-Language');
    assert.equal(languageResponse.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(languageResponse.headers.get('Location'), null);
  });
  console.log(`Locale SEO checks passed: ${checks} offline integration groups (draft/release gates, sitemap/copy safety, crawler routing and Accept-Language).`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
