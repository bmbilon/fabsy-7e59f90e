/** Shared, fail-closed locale SEO policy for snapshots, sitemaps and release copy. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_SOURCE_DOCUMENT_PATHS, fingerprint, isLocaleIndexable, isLocaleReleased } from '../src/i18n/locale-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://fabsy.ca';
export const LOCALE_MANIFEST_NAME = 'locale-manifest.json';
export const LOCALE_ROUTE_ALIASES = Object.freeze({
  '/ticket-form': '/submit-ticket',
});
// Purchase terms are a separate authoritative agreement. Until that document
// has its own reviewed translation, localized routes offer an English handoff.
const ENGLISH_ONLY_ROUTES = new Set(['/terms-of-purchase']);
export const SOURCE_DOCUMENT_PATHS = LEGAL_SOURCE_DOCUMENT_PATHS;

export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function readJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read locale input ${filename}: ${error.message}`);
  }
}

export function normalizeRoute(value) {
  if (typeof value !== 'string' || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?\/?$/.test(value)) {
    throw new Error(`Invalid public snapshot route: ${String(value)}`);
  }
  return value.replace(/\/+$/, '') || '/';
}

export function localePath(code, basePath = '/') {
  const clean = normalizeRoute(basePath);
  if (code === 'en') return clean;
  if (!/^[a-z]{2}(?:-[a-z]+)?$/.test(code)) throw new Error(`Invalid locale: ${code}`);
  return clean === '/' ? `/${code}/` : `/${code}${clean}`;
}

export function canonicalUrl(code, basePath = '/') {
  return `${SITE}${localePath(code, basePath)}`;
}

export function loadLocaleSeoContext(options = {}) {
  const registry = readJson(options.registryPath || process.env.LOCALE_REGISTRY_PATH || path.join(ROOT, 'src/i18n/locales.json'));
  const review = readJson(options.reviewPath || process.env.LOCALE_REVIEW_PATH || path.join(ROOT, 'src/i18n/review-status.json'));
  const bundlesDir = options.bundlesDir || process.env.LOCALE_BUNDLES_DIR || path.join(ROOT, 'src/i18n/locales');
  const offers = readJson(options.offersPath || process.env.LOCALE_OFFERS_PATH || path.join(ROOT, 'src/config/offers.json'));
  const sourceRoot = path.resolve(options.sourceRoot || process.env.LOCALE_SOURCE_ROOT || ROOT);
  const sourceDocuments = Object.fromEntries(SOURCE_DOCUMENT_PATHS.map(filename => [filename, fingerprint(fs.readFileSync(path.join(sourceRoot, filename), 'utf8'))]));
  if (!registry.sourceVersion || !Array.isArray(registry.locales) || !Array.isArray(registry.phase1Routes) || !Array.isArray(registry.indexableRoutes)) {
    throw new Error('Locale registry must define sourceVersion, locales and Phase 1 route inventories');
  }
  const knownCodes = new Set();
  for (const locale of registry.locales) {
    if (!/^[a-z]{2}(?:-[a-z]+)?$/.test(locale.code) || knownCodes.has(locale.code) || !['ltr', 'rtl'].includes(locale.dir)) {
      throw new Error(`Invalid or duplicate locale registry entry: ${locale.code}`);
    }
    knownCodes.add(locale.code);
  }
  const locales = registry.locales.filter(locale => locale.wave <= 1);
  if (!locales.some(locale => locale.code === 'en')) throw new Error('English source locale is required');
  const bundles = Object.fromEntries(locales.map(locale => [locale.code, readJson(path.join(bundlesDir, `${locale.code}.json`))]));
  const sourceFingerprint = fingerprint({ english: bundles.en, offers });
  const bundleFingerprints = Object.fromEntries(locales.map(locale => [locale.code, fingerprint(bundles[locale.code])]));
  const phase1Routes = [...new Set(registry.phase1Routes.map(normalizeRoute))];
  // A return/receipt page needs the client's verified payment state. It must
  // never be materialized from a URL alone, even as a noindex snapshot.
  const snapshotRoutes = phase1Routes.filter(route => !LOCALE_ROUTE_ALIASES[route] && !ENGLISH_ONLY_ROUTES.has(route) && route !== '/thank-you');
  const indexableRoutes = new Set(registry.indexableRoutes.map(normalizeRoute));
  if ([...indexableRoutes].some(route => !snapshotRoutes.includes(route))) throw new Error('Indexable locale routes must have translated Phase 1 snapshots');
  const released = code => isLocaleReleased(code, review, {
    sourceVersion: registry.sourceVersion,
    sourceFingerprint,
    bundleFingerprint: bundleFingerprints[code],
    sourceDocuments,
  });
  const indexable = code => isLocaleIndexable(code, review, {
    sourceVersion: registry.sourceVersion,
    sourceFingerprint,
    bundleFingerprint: bundleFingerprints[code],
    sourceDocuments,
  });
  return { registry, review, locales, bundles, offers, phase1Routes, snapshotRoutes, indexableRoutes, sourceFingerprint, bundleFingerprints, sourceDocuments, released, indexable };
}

export function splitSnapshotRoute(route, context) {
  const clean = normalizeRoute(route);
  const [segment, ...parts] = clean.slice(1).split('/');
  const locale = context.registry.locales.find(item => item.code !== 'en' && item.code === segment);
  return locale ? { code: locale.code, basePath: parts.length ? `/${parts.join('/')}` : '/' }
    : { code: 'en', basePath: clean };
}

export function isIndexable(context, code, basePath, existingNoindex = false) {
  if (existingNoindex) return false;
  const route = normalizeRoute(basePath);
  if (code === 'en') return ENGLISH_ONLY_ROUTES.has(route) || !context.phase1Routes.includes(route) || context.indexableRoutes.has(route);
  return context.indexable(code) && context.indexableRoutes.has(route);
}

export function alternateLinks(context, code, basePath, existingNoindex = false) {
  if (!isIndexable(context, code, basePath, existingNoindex)) return [];
  const route = normalizeRoute(basePath);
  const equivalents = context.indexableRoutes.has(route)
    ? context.locales.filter(locale => context.indexable(locale.code))
    : context.locales.filter(locale => locale.code === 'en');
  return [
    ...equivalents.map(locale => ({ languageTag: locale.languageTag, href: canonicalUrl(locale.code, route) })),
    { languageTag: 'x-default', href: canonicalUrl('en', route) },
  ];
}

export function attribute(tag, name) {
  return tag?.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? null;
}

function tagMatching(html, element, attr, value) {
  return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, 'gi'))]
    .map(match => match[0]).find(tag => attribute(tag, attr)?.toLowerCase() === value.toLowerCase()) || null;
}

export function robotsFromHtml(html) {
  return attribute(tagMatching(html, 'meta', 'name', 'robots'), 'content');
}

export function canonicalFromHtml(html) {
  return attribute(tagMatching(html, 'link', 'rel', 'canonical'), 'href');
}

export function hreflangMarkup(context, code, basePath, existingNoindex = false) {
  return alternateLinks(context, code, basePath, existingNoindex)
    .map(link => `<link rel="alternate" hreflang="${escapeHtml(link.languageTag)}" href="${escapeHtml(link.href)}">`).join('\n');
}

/** Touch only metadata in a real snapshot; never translate or copy an English body. */
export function normalizeSnapshotHead(html, route, context) {
  const { code, basePath } = splitSnapshotRoute(route, context);
  const locale = context.locales.find(item => item.code === code);
  if (!locale || (code !== 'en' && !context.snapshotRoutes.includes(basePath))) {
    throw new Error(`No translated snapshot is registered for ${route}`);
  }
  const existingNoindex = /\bnoindex\b/i.test(robotsFromHtml(html) || '');
  const indexable = isIndexable(context, code, basePath, existingNoindex);
  const robots = indexable ? 'index, follow' : 'noindex, nofollow';
  const canonical = canonicalUrl(code, basePath);
  const next = html.replace(/<html\b[^>]*>/i, tag => {
    const clean = tag.replace(/\s+(?:lang|dir)=["'][^"']*["']/gi, '');
    return clean.replace(/>$/, ` lang="${locale.languageTag}" dir="${locale.dir}">`);
  }).replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, head => {
    const clean = head.replace(/<link\b[^>]*>/gi, tag => {
      const rel = attribute(tag, 'rel');
      return rel?.toLowerCase() === 'canonical' || (rel?.toLowerCase() === 'alternate' && attribute(tag, 'hreflang')) ? '' : tag;
    }).replace(/<meta\b[^>]*>/gi, tag => {
      const name = attribute(tag, 'name')?.toLowerCase();
      const property = attribute(tag, 'property')?.toLowerCase();
      return name === 'robots' || property === 'og:url' ? '' : tag;
    });
    return clean.replace(/<\/head>/i,
      `<link rel="canonical" href="${escapeHtml(canonical)}">\n<meta name="robots" content="${robots}">\n<meta property="og:url" content="${escapeHtml(canonical)}">\n${hreflangMarkup(context, code, basePath, existingNoindex)}\n</head>`);
  });
  if (!/<head\b/i.test(next) || !/<html\b/i.test(next)) throw new Error(`Snapshot is not a complete HTML document: ${route}`);
  return next;
}

export function assertSnapshotHead(html, route, context) {
  const { code, basePath } = splitSnapshotRoute(route, context);
  const locale = context.locales.find(item => item.code === code);
  if (!locale || (code !== 'en' && !context.snapshotRoutes.includes(basePath))) throw new Error(`Unsupported translated snapshot: ${route}`);
  const canonicalTags = [...html.matchAll(/<link\b[^>]*>/gi)].filter(match => attribute(match[0], 'rel')?.toLowerCase() === 'canonical');
  if (canonicalTags.length !== 1 || canonicalFromHtml(html) !== canonicalUrl(code, basePath)) throw new Error(`Snapshot has wrong or duplicate canonical: ${route}`);
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  if (attribute(htmlTag, 'lang') !== locale.languageTag || attribute(htmlTag, 'dir') !== locale.dir) {
    throw new Error(`Snapshot has wrong language/direction: ${route}`);
  }
  const robotsTags = [...html.matchAll(/<meta\b[^>]*>/gi)].filter(match => attribute(match[0], 'name')?.toLowerCase() === 'robots');
  if (robotsTags.length !== 1 || !robotsFromHtml(html)) throw new Error(`Snapshot must declare exactly one robots policy: ${route}`);
  const noindex = /\bnoindex\b/i.test(robotsFromHtml(html));
  if (!isIndexable(context, code, basePath) && !noindex) throw new Error(`Unreviewed or private snapshot is indexable: ${route}`);
  if (code !== 'en' && isIndexable(context, code, basePath) && noindex) throw new Error(`Approved locale snapshot is unexpectedly noindex: ${route}`);
  const actual = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(match => match[0]).filter(tag => attribute(tag, 'rel') === 'alternate' && attribute(tag, 'hreflang'))
    .map(tag => ({ languageTag: attribute(tag, 'hreflang'), href: attribute(tag, 'href') }));
  const expected = alternateLinks(context, code, basePath, noindex);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Snapshot has stale or unreviewed hreflang links: ${route}`);
}

export function localeSnapshotRecords(context) {
  return context.locales.filter(locale => locale.code !== 'en').flatMap(locale => context.snapshotRoutes.map(basePath => ({
    code: locale.code,
    basePath,
    route: localePath(locale.code, basePath),
    canonical: canonicalUrl(locale.code, basePath),
    indexable: isIndexable(context, locale.code, basePath),
  })));
}

export function snapshotFile(root, route) {
  const clean = normalizeRoute(route);
  if (clean === '/faq') return path.join(root, 'faq.html');
  return path.join(root, ...clean.split('/').filter(Boolean), 'index.html');
}

export function htmlFilesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Snapshot tree contains a symbolic link: ${target}`);
    if (entry.isDirectory()) return htmlFilesUnder(target);
    return entry.isFile() && entry.name.endsWith('.html') ? [target] : [];
  });
}

export function routeForSnapshotFile(root, filename) {
  const relative = path.relative(root, filename).split(path.sep).join('/');
  if (relative === 'faq.html') return '/faq';
  if (relative === 'index.html') return '/';
  if (!relative.endsWith('/index.html') || relative.startsWith('../')) throw new Error(`Unexpected snapshot filename: ${relative}`);
  return normalizeRoute(`/${relative.slice(0, -'/index.html'.length)}`);
}

export function verifyLocaleSnapshotCoverage(root, context) {
  const manifest = readJson(path.join(root, LOCALE_MANIFEST_NAME));
  const records = localeSnapshotRecords(context);
  const localeStates = Object.fromEntries(context.locales.map(locale => [locale.code, {
    released: context.released(locale.code),
    indexable: context.indexable(locale.code),
  }]));
  if (manifest.version !== 1 || manifest.sourceVersion !== context.registry.sourceVersion || manifest.sourceFingerprint !== context.sourceFingerprint
    || fingerprint(manifest.bundleFingerprints || {}) !== fingerprint(context.bundleFingerprints)
    || fingerprint(manifest.localeStates || {}) !== fingerprint(localeStates)
    || fingerprint(manifest.sourceDocuments || {}) !== fingerprint(context.sourceDocuments)) {
    throw new Error('Localized snapshots are stale: regenerate them after source, price, bundle or review changes');
  }
  if (manifest.generatedCount !== records.length || JSON.stringify(manifest.records) !== JSON.stringify(records)) {
    throw new Error('Localized snapshot manifest does not match the current routes and approval gates');
  }
  const expected = new Set(records.map(record => path.resolve(snapshotFile(root, record.route))));
  const actual = context.registry.locales.filter(locale => locale.code !== 'en')
    .flatMap(locale => htmlFilesUnder(path.join(root, locale.code)));
  if (actual.length !== expected.size || actual.some(filename => !expected.has(path.resolve(filename)))) {
    throw new Error('Localized snapshot directory contains missing or unregistered routes');
  }
  for (const record of records) {
    const filename = snapshotFile(root, record.route);
    if (!fs.existsSync(filename)) throw new Error(`Localized snapshot missing: ${record.route}`);
    assertSnapshotHead(fs.readFileSync(filename, 'utf8'), record.route, context);
  }
  for (const basePath of new Set(records.filter(record => record.indexable).map(record => record.basePath))) {
    const filename = snapshotFile(root, basePath);
    if (!fs.existsSync(filename)) throw new Error(`Approved translation lacks an English counterpart snapshot: ${basePath}`);
    const english = fs.readFileSync(filename, 'utf8');
    if (canonicalFromHtml(english) !== canonicalUrl('en', basePath) || /\bnoindex\b/i.test(robotsFromHtml(english) || '')) {
      throw new Error(`Approved translation has no indexable English counterpart: ${basePath}`);
    }
  }
  return manifest;
}

/** Build-time only: refresh reciprocal English alternates in the staged copy. */
export function normalizeStagedEnglishSnapshots(root, context) {
  let count = 0;
  for (const filename of htmlFilesUnder(root)) {
    const route = routeForSnapshotFile(root, filename);
    const { code, basePath } = splitSnapshotRoute(route, context);
    if (code !== 'en') continue;
    const original = fs.readFileSync(filename, 'utf8');
    if (canonicalFromHtml(original) !== canonicalUrl(code, basePath)) {
      throw new Error(`English snapshot canonical does not match its route: ${route}`);
    }
    const updated = normalizeSnapshotHead(original, route, context);
    assertSnapshotHead(updated, route, context);
    if (updated !== original) {
      fs.writeFileSync(filename, updated, 'utf8');
      count += 1;
    }
  }
  return count;
}
