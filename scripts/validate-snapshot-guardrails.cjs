#!/usr/bin/env node
/**
 * Validate reviewed ssg-pages inputs and generated content snapshots.
 *
 * This intentionally ignores unreviewed legacy DB source fields. Those fields
 * are replaced by generate-static-snapshots.cjs before they become deployable.
 */
const fs = require('fs');
const path = require('path');
const {
  EXACT_FABSY_PRICING,
  canonicalFaq,
  curatedPageIssues,
  present,
  textGuardrailIssues,
} = require('./curated-content-guardrails.cjs');

const ROOT = path.resolve(__dirname, '..');
const DB_DIR = path.resolve(process.env.PAGE_CONTENT_DIR || path.join(ROOT, 'src/content/pages'));
const CURATED_DIR = path.resolve(process.env.SNAPSHOT_CURATED_DIR || path.join(ROOT, 'ssg-pages'));
const SNAPSHOT_DIR = path.resolve(
  process.env.SNAPSHOT_OUT_DIR || path.join(ROOT, 'public/prerendered/content')
);
const MANIFEST_PATH = path.resolve(
  process.env.SNAPSHOT_MANIFEST || path.join(path.dirname(SNAPSHOT_DIR), 'content-manifest.json')
);
const SITE = 'https://fabsy.ca';
const PRICING_TEXT = EXACT_FABSY_PRICING;
const OFFER_DATA = require('../src/config/offers.json');
const APPROVED_OFFER_PRICES = new Map([
  [OFFER_DATA.rapidResolution.name, OFFER_DATA.rapidResolution.priceCad],
  [OFFER_DATA.rapidResolution.shortName, OFFER_DATA.rapidResolution.priceCad],
  [OFFER_DATA.insuranceReport.name, OFFER_DATA.insuranceReport.priceCad],
  [OFFER_DATA.insuranceReport.shortName, OFFER_DATA.insuranceReport.priceCad],
  [OFFER_DATA.bundle.name, OFFER_DATA.bundle.priceCad],
  [OFFER_DATA.bundle.shortName, OFFER_DATA.bundle.priceCad],
]);
const VERIFIED_CLIENT_TESTIMONIALS = require('../src/content/client-testimonials.json').filter(
  (testimonial) => testimonial.publicationPermissionConfirmed === true
);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];
const fail = (message) => errors.push(message);

function redactVerifiedClientTestimonials(value) {
  return VERIFIED_CLIENT_TESTIMONIALS.reduce(
    (text, testimonial) => text.split(testimonial.quote).join('[verified client testimonial]'),
    String(value ?? '')
  );
}

function guardedText(value, label, slug, options) {
  const candidate = redactVerifiedClientTestimonials(value);
  for (const issue of textGuardrailIssues(candidate, slug, options)) fail(`${label}: ${issue}`);
}

function normalizedFaqs(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label}: faqs must be an array`);
    return [];
  }
  const faqs = [];
  value.forEach((faq, index) => {
    const q = typeof faq?.q === 'string' ? faq.q.trim() : '';
    const a = typeof faq?.a === 'string' ? faq.a.trim() : '';
    if (!q || !a) fail(`${label}: FAQ ${index + 1} is missing q or a`);
    if (q !== faq?.q || a !== faq?.a) fail(`${label}: FAQ ${index + 1} has surrounding whitespace`);
    if (/[<>]/.test(q) || /[<>]/.test(a)) fail(`${label}: FAQ ${index + 1} contains HTML`);
    guardedText(q, `${label}: FAQ ${index + 1} question`);
    guardedText(a, `${label}: FAQ ${index + 1} answer`);
    if (q && a) faqs.push({ q, a });
  });
  return faqs;
}

function readSourceInventory(directory, label, required = true) {
  const pages = new Map();
  if (!fs.existsSync(directory)) {
    if (required) fail(`${label} source directory missing: ${directory}`);
    return { pages, slugs: [] };
  }

  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    const fileSlug = path.basename(file, '.json');
    let page;
    try {
      page = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    } catch (_) {
      fail(`${label} ${file}: invalid JSON`);
      continue;
    }
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      fail(`${label} ${file}: source is not a page object`);
      continue;
    }
    if (!SLUG_RE.test(fileSlug)) {
      fail(`${label} ${file}: filename is not a usable slug`);
      continue;
    }
    if (pages.has(page.slug)) {
      fail(`${label} ${file}: duplicate slug cannot map to one URL`);
      continue;
    }
    if (page.slug !== fileSlug) {
      fail(`${label} ${file}: slug does not match filename`);
      continue;
    }
    pages.set(fileSlug, page);
  }
  return { pages, slugs: [...pages.keys()].sort() };
}

function validateCuratedPages(inventory, dbInventory) {
  let checked = 0;
  const checkedSlugs = [];
  const quarantinedSlugs = [];
  for (const [slug, page] of inventory.pages) {
    if (!present(page.hook)) continue;
    const candidate = { ...(dbInventory.pages.get(slug) || {}), ...page };
    if (curatedPageIssues(candidate).length > 0) {
      quarantinedSlugs.push(slug);
      continue;
    }
    checked += 1;
    checkedSlugs.push(slug);
  }
  return {
    count: checked,
    slugs: checkedSlugs.sort(),
    quarantinedSlugs: quarantinedSlugs.sort(),
  };
}

function decodeHtml(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tagText(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, '')).trim();
}

function renderedPageText(value) {
  return decodeHtml(
    String(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(?:noscript|template)\b[^>]*>[\s\S]*?<\/(?:noscript|template)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Curated/generated articles require the complete approved pricing paragraph.
 * Browser UI also contains named price cards, navigation and checkout links.
 * Recognize those short commercial facts without allowing the same numbers to
 * pass as legal fines, insurance savings, or a different product's price.
 */
function redactBrowserCommercialFacts(value, slug) {
  let text = String(value);
  const rapid = escapeRegExp(OFFER_DATA.rapidResolution.name);
  const report = `(?:${[OFFER_DATA.insuranceReport.name, OFFER_DATA.insuranceReport.shortName].map(escapeRegExp).join('|')})`;
  const bundle = `(?:${[OFFER_DATA.bundle.name, OFFER_DATA.bundle.shortName].map(escapeRegExp).join('|')})`;
  const currency = String.raw`(?:\s+CAD)?(?:\s*(?:\+|plus)\s+(?:applicable\s+)?GST)?`;
  const priceRules = [
    [OFFER_DATA.rapidResolution.priceCad, [
      `${rapid}\\s*(?:[·(–-]\\s*)?`,
      `${rapid}\\s+(?:costs?|is|for)\\s+`,
      `${rapid}\\s+One flat pre-trial service fee\\s+`,
      `${rapid}\\s*\\|\\s*Alberta (?:Traffic )?Ticket (?:Help|Service)\\s*\\|\\s*`,
      `${rapid} provides eligible Alberta pre-trial traffic ticket agent services for\\s+`,
      '(?:Start|Start Rapid Resolution)\\s*·\\s*',
      'Start Rapid Resolution View everything included\\s+',
      ...(slug === 'submit-ticket' ? ['continue to the transparent\\s+'] : []),
      ...(slug === 'index' || slug === 'rapid-resolution'
        ? ['What (?:is included for|does the)\\s+'] : []),
    ], [
      `${currency}\\s+${rapid}(?!\\s*(?:Bundle|\\+))\\b`,
      `${currency}\\s*·\\s*(?:trial separate|Eligible pre-trial matters)\\b`,
    ]],
    [OFFER_DATA.insuranceReport.priceCad, [
      `${report}\\s*(?:\\(\\s*)?`,
      `${report}\\s+(?:costs?|is)\\s+`,
      '(?:Get the report for|Standalone report)\\s+',
      ...(slug === 'insurance-damage-report' ? ['Get started for\\s+'] : []),
    ], [
      '\\s+(?:standalone |insurance )?report\\b',
      `${currency}\\s+${report}\\b`,
      `${currency}, Fabsy prepares a personalized, source-backed planning report\\b`,
    ]],
    [OFFER_DATA.bundle.priceCad, [
      `${bundle}\\s+`,
      `${bundle}\\s+(?:bundle\\s+)?costs?\\s+`,
      `${rapid} bundle Both services\\s+`,
      `${rapid} Bundle ${rapid} plus the ${escapeRegExp(OFFER_DATA.insuranceReport.shortName)}\\.\\s+`,
      `both the report and ${rapid} for\\s+`,
      'both(?: products| services)? (?:costs?|are)\\s+',
    ], [
      '\\s+bundle\\b',
      `${currency}\\s+${bundle}\\b`,
    ]],
  ];
  for (const [price, prefixes, suffixes] of priceRules) {
    const amount = String.raw`\$\s*${price}(?:\.00)?(?![\d,]|\.\d)`;
    for (const prefix of prefixes) {
      text = text.replace(new RegExp(`(?:${prefix})(${amount})`, 'gi'),
        (match) => match.replace(new RegExp(amount), '[approved offer amount]'));
    }
    for (const suffix of suffixes) {
      text = text.replace(new RegExp(`(${amount})(?:${suffix})`, 'gi'),
        (match) => match.replace(new RegExp(amount), '[approved offer amount]'));
    }
  }

  // Short headings/questions must share the full service-clock boundary with
  // the page. An arbitrary "resolved within 48 hours" remains a failing claim.
  if (text.includes(OFFER_DATA.rapidResolution.speedDisclaimer)) {
    const hours = OFFER_DATA.rapidResolution.actionCommitmentHours;
    const approvedActionCopy = [
      `${hours}-hour Fabsy action commitment`,
      `When does the ${hours}-hour commitment begin?`,
      `Is the matter resolved within ${hours} hours?`,
      `The ${hours}-hour commitment, precisely defined`,
      `The ${hours}-hour commitment Complete disclosure in. Fabsy's next action within ${hours} hours.`,
      `Fabsy acts within ${hours} hours of complete disclosure`,
      `The ${hours}-hour commitment covers Fabsy's next authorized action, not Crown timing.`,
      `Complete, readable disclosure is reviewed and the next authorized step is prepared or submitted within ${hours} hours after it is matched to your file.`,
      `Within ${hours} hours after complete disclosure is received and matched, Fabsy prepares or submits the next authorized prosecutor-review step. The clock covers Fabsy's action, not Crown response time.`,
    ];
    for (const copy of approvedActionCopy) {
      text = text.split(copy).join('[approved Fabsy action description]');
    }
  }
  // This is a named document input, not a premium/conviction lookback claim.
  // Verified: https://www.alberta.ca/commercial-driver-abstract (3/5/10-year CDA).
  if (slug === 'insurance-damage-report') {
    text = text.replace(/\bcommercial 5-year Alberta driver['’]s abstract\b/gi, '[approved abstract input]');
  }
  return text;
}

function browserTextGuardrailIssues(html, slug, { numeric = true } = {}) {
  const raw = redactVerifiedClientTestimonials(html);
  // The strict article paragraph rule is replaced here, not disabled globally:
  // browser prices have product-specific checks below and JSON-LD is validated
  // separately. Marketing claims remain checked in the complete raw document.
  const issues = textGuardrailIssues(raw, slug, { numeric: false })
    .filter((issue) => issue !== 'partial or inexact Fabsy pricing');
  const rendered = renderedPageText(raw);
  const candidate = redactBrowserCommercialFacts(rendered, slug);
  if (/\$\s*\d/.test(rendered) && !/(?:\bplus|\+)\s+(?:applicable\s+)?GST\b/i.test(rendered)) {
    issues.push('Fabsy pricing must disclose applicable GST separately');
  }
  if (numeric) {
    issues.push(...textGuardrailIssues(candidate, slug, { marketing: false }));
  } else if (/\$\s*\d/.test(candidate.split(PRICING_TEXT).join(''))) {
    // Blog article numeric facts have their own gate, but an unsupported UI
    // price cannot escape merely because it appears on a blog route.
    issues.push('unsupported monetary legal claim');
  }
  return [...new Set(issues)];
}

function extractFaqSchema(html, label) {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of scripts) {
    try {
      const value = JSON.parse(match[1].trim());
      if (value && value['@type'] === 'FAQPage') return value;
    } catch (_) {
      fail(`${label}: invalid JSON-LD block`);
    }
  }
  fail(`${label}: FAQPage JSON-LD missing`);
  return null;
}

function isApprovedFabsyOffer(value, inheritedItemName) {
  const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
  if (!types.includes('Offer')) return false;

  const itemOffered = value?.itemOffered;
  const specification = value?.priceSpecification;
  const itemName = itemOffered?.name || inheritedItemName;
  const approvedPrice = APPROVED_OFFER_PRICES.get(itemName);
  const offeredPrice = Number(value?.price);
  const specifiedPrice = specification?.price === undefined ? offeredPrice : Number(specification.price);
  const isCanonicalRapidResolutionOffer =
    offeredPrice === OFFER_DATA.rapidResolution.priceCad &&
    value?.description === PRICING_TEXT &&
    value?.url === `${SITE}${OFFER_DATA.rapidResolution.intakePath}`;
  const expectedPrice = isCanonicalRapidResolutionOffer
    ? OFFER_DATA.rapidResolution.priceCad
    : approvedPrice;
  return (
    (Number.isFinite(approvedPrice) || isCanonicalRapidResolutionOffer) &&
    offeredPrice === expectedPrice &&
    value?.priceCurrency === 'CAD' &&
    specifiedPrice === expectedPrice &&
    (specification?.priceCurrency === undefined || specification.priceCurrency === 'CAD') &&
    specification?.valueAddedTaxIncluded !== true
  );
}

function containsDisallowedOfferPricing(value, inheritedItemName) {
  if (Array.isArray(value)) {
    return value.some((item) => containsDisallowedOfferPricing(item, inheritedItemName));
  }
  if (!value || typeof value !== 'object') return false;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  const itemName =
    (types.includes('Product') || types.includes('Service')) && value.name
      ? value.name
      : inheritedItemName;
  if (
    types.includes('Offer') &&
    (Object.prototype.hasOwnProperty.call(value, 'price') ||
      Object.prototype.hasOwnProperty.call(value, 'priceCurrency'))
  ) {
    return !isApprovedFabsyOffer(value, itemName);
  }
  return Object.values(value).some((item) => containsDisallowedOfferPricing(item, itemName));
}

function hasDisallowedOfferPricing(html) {
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      if (containsDisallowedOfferPricing(JSON.parse(match[1].trim()))) return true;
    } catch (_) {
      // Invalid JSON-LD is reported by the schema-specific checks.
    }
  }
  return false;
}

function isApprovedVerifiedReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowedKeys = new Set(['@type', 'author', 'reviewBody', 'itemReviewed']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (value['@type'] !== 'Review' || typeof value.reviewBody !== 'string') return false;
  if (value.author?.['@type'] !== 'Person' || typeof value.author?.name !== 'string') return false;
  if (
    value.itemReviewed?.['@type'] !== 'ProfessionalService' ||
    value.itemReviewed?.name !== 'Fabsy Traffic Ticket Services' ||
    value.itemReviewed?.url !== SITE
  ) {
    return false;
  }
  return VERIFIED_CLIENT_TESTIMONIALS.some(
    (testimonial) =>
      testimonial.quote === value.reviewBody &&
      testimonial.name === value.author.name
  );
}

function containsDisallowedRatingOrReview(value) {
  if (Array.isArray(value)) return value.some(containsDisallowedRatingOrReview);
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'aggregateRating')) return true;
  if (value['@type'] === 'Review' && !isApprovedVerifiedReview(value)) return true;
  if (Object.prototype.hasOwnProperty.call(value, 'review')) {
    const reviews = Array.isArray(value.review) ? value.review : [value.review];
    if (!reviews.length || reviews.some((review) => !isApprovedVerifiedReview(review))) return true;
  }
  return Object.values(value).some(containsDisallowedRatingOrReview);
}

function hasDisallowedRatingOrReviewSchema(html) {
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      if (containsDisallowedRatingOrReview(JSON.parse(match[1].trim()))) return true;
    } catch (_) {
      // Invalid JSON-LD is reported by the schema-specific checks.
    }
  }
  return false;
}

function visibleFaqs(html) {
  return [...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)].map((details) => {
    const question = /<summary\b[^>]*>[\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/summary>/i.exec(
      details[1]
    );
    const answer = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(details[1]);
    return { q: tagText(question?.[1] || ''), a: tagText(answer?.[1] || '') };
  });
}

function metaContent(html, name) {
  const match = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i').exec(html);
  return match ? decodeHtml(match[1]) : '';
}

function validatedSlugArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`snapshot manifest ${label} must be an array`);
    return [];
  }
  const seen = new Set();
  for (const slug of value) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      fail(`snapshot manifest ${label} contains an invalid slug: ${String(slug)}`);
      continue;
    }
    if (seen.has(slug)) fail(`snapshot manifest ${label} contains duplicate slug: ${slug}`);
    seen.add(slug);
  }
  const sorted = [...value].sort();
  if (JSON.stringify(value) !== JSON.stringify(sorted)) {
    fail(`snapshot manifest ${label} must be sorted`);
  }
  return [...seen].sort();
}

function sameSlugs(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `snapshot manifest ${label} mismatch (expected ${expected.length}, recorded ${actual.length})`
    );
  }
}

function validateSnapshots(dbInventory, curatedInventory, reviewedCurated) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail(`snapshot manifest missing: ${MANIFEST_PATH}`);
    return 0;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (_) {
    fail('snapshot manifest is invalid JSON');
    return 0;
  }
  if (manifest.version !== 2) {
    fail(`snapshot manifest version must be 2, found ${String(manifest.version)}`);
  }
  if (Array.isArray(manifest.excluded) && manifest.excluded.length > 0) {
    fail('snapshot manifest must not exclude usable source rows');
  }

  const slugs = validatedSlugArray(manifest.slugs, 'slugs');
  const dbSlugs = validatedSlugArray(manifest.dbSlugs, 'dbSlugs');
  const curatedSourceSlugs = validatedSlugArray(
    manifest.curatedSourceSlugs,
    'curatedSourceSlugs'
  );
  const curatedOnlySlugs = validatedSlugArray(manifest.curatedOnlySlugs, 'curatedOnlySlugs');
  const curatedSlugs = validatedSlugArray(manifest.curatedSlugs, 'curatedSlugs');
  const quarantinedCuratedSlugs = validatedSlugArray(
    manifest.quarantinedCuratedSlugs,
    'quarantinedCuratedSlugs'
  );

  const expectedUnion = [...new Set([...dbInventory.slugs, ...curatedInventory.slugs])].sort();
  const expectedCuratedOnly = curatedInventory.slugs.filter(
    (slug) => !dbInventory.pages.has(slug)
  );
  sameSlugs(dbSlugs, dbInventory.slugs, 'dbSlugs');
  sameSlugs(curatedSourceSlugs, curatedInventory.slugs, 'curatedSourceSlugs');
  sameSlugs(curatedOnlySlugs, expectedCuratedOnly, 'curatedOnlySlugs');
  sameSlugs(curatedSlugs, reviewedCurated.slugs, 'curatedSlugs');
  sameSlugs(
    quarantinedCuratedSlugs,
    reviewedCurated.quarantinedSlugs,
    'quarantinedCuratedSlugs'
  );
  sameSlugs(slugs, expectedUnion, 'slugs/source union');

  const countChecks = [
    ['dbSourceCount', manifest.dbSourceCount, dbSlugs.length],
    ['curatedSourceCount', manifest.curatedSourceCount, curatedSourceSlugs.length],
    ['curatedOnlyCount', manifest.curatedOnlyCount, curatedOnlySlugs.length],
    ['sourceUnionCount', manifest.sourceUnionCount, expectedUnion.length],
    ['generatedCount', manifest.generatedCount, slugs.length],
    ['curatedCount', manifest.curatedCount, curatedSlugs.length],
    ['fallbackCount', manifest.fallbackCount, slugs.length - curatedSlugs.length],
  ];
  for (const [label, actual, expected] of countChecks) {
    if (!Number.isInteger(actual) || actual !== expected) {
      fail(`snapshot manifest ${label} mismatch (expected ${expected}, recorded ${String(actual)})`);
    }
  }
  if (manifest.generatedCount !== manifest.sourceUnionCount) {
    fail('snapshot manifest must generate one snapshot for every usable source slug');
  }
  if (manifest.curatedCount + manifest.fallbackCount !== manifest.generatedCount) {
    fail('snapshot manifest curated/fallback counts do not cover every generated snapshot');
  }
  if (manifest.pageSyncCount !== null && manifest.pageSyncCount !== dbSlugs.length) {
    fail(
      `snapshot manifest pageSyncCount mismatch (expected ${dbSlugs.length}, recorded ${String(manifest.pageSyncCount)})`
    );
  }

  const expected = new Set(slugs);
  for (const slug of expected) {
    const label = `snapshot ${slug}`;
    const file = path.join(SNAPSHOT_DIR, slug, 'index.html');
    if (!fs.existsSync(file)) {
      fail(`${label}: file missing`);
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');
    guardedText(html, label, slug);
    if (/"@type"\s*:\s*"LegalService"/.test(html)) {
      fail(`${label}: Fabsy must not be represented as a LegalService`);
    }
    if (hasDisallowedOfferPricing(html)) {
      fail(`${label}: Fabsy Offer schema contains an unapproved fixed price`);
    }
    if (!html.includes(PRICING_TEXT)) fail(`${label}: exact pricing language missing`);
    if (!html.includes('Fabsy is an agent service') || !html.includes('not a law firm')) {
      fail(`${label}: agent-service disclaimer missing`);
    }
    const discoverySignals = [
      'Rapid Resolution',
      'secure digital intake',
      'technology-assisted',
      '48-hour clock',
      'Insurance Impact &amp; Renewal Planning Report',
      'Trial representation',
      'href="/submit-ticket"',
    ];
    for (const signal of discoverySignals) {
      if (!html.toLowerCase().includes(signal.toLowerCase())) {
        fail(`${label}: Rapid Resolution discovery signal missing: ${signal}`);
      }
    }
    if (!html.includes(`<link rel="canonical" href="${SITE}/content/${slug}">`)) {
      fail(`${label}: self-referential canonical missing`);
    }
    const expectedRobots = /^(?:test(?:-|$)|verify-smoke(?:-|$))/.test(slug)
      ? 'noindex, nofollow'
      : 'index, follow';
    if (!html.includes(`<meta name="robots" content="${expectedRobots}">`)) {
      fail(`${label}: robots directive must be "${expectedRobots}"`);
    }

    const title = tagText(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '');
    const description = metaContent(html, 'description');
    if (!title || title.length > 60) fail(`${label}: title missing or exceeds 60 characters`);
    if (!description || description.length > 155) {
      fail(`${label}: description missing or exceeds 155 characters`);
    }
    if (!reviewedCurated.slugs.includes(slug)) {
      if (/^Traffic Ticket Options in\b/i.test(title)) {
        fail(`${label}: fallback title is generic instead of offence-specific`);
      }
      if (!description.includes('Rapid Resolution')) {
        fail(`${label}: fallback description does not connect the answer to Rapid Resolution`);
      }
    }

    const visible = visibleFaqs(html);
    const schema = extractFaqSchema(html, label);
    if (!visible.length) fail(`${label}: visible FAQs missing`);
    if (schema && JSON.stringify(schema) !== JSON.stringify(canonicalFaq(visible))) {
      fail(`${label}: visible FAQs and FAQPage JSON-LD differ`);
    }
  }

  const actual = fs.existsSync(SNAPSHOT_DIR)
    ? fs
        .readdirSync(SNAPSHOT_DIR, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() && fs.existsSync(path.join(SNAPSHOT_DIR, entry.name, 'index.html'))
        )
        .map((entry) => entry.name)
    : [];
  if (actual.length !== expected.size || actual.some((slug) => !expected.has(slug))) {
    fail(`snapshot directory coverage mismatch (expected ${expected.size}, found ${actual.length})`);
  }
  return expected.size;
}

function htmlFilesUnder(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.html')) files.push(target);
    }
  };
  visit(root);
  return files.sort();
}

function validateAllPrerendered() {
  if (process.env.VALIDATE_ALL_PRERENDERED !== '1') return 0;
  const prerenderRoot = path.dirname(SNAPSHOT_DIR);
  const files = htmlFilesUnder(prerenderRoot);
  if (!files.length) {
    fail(`no prerendered HTML found under ${prerenderRoot}`);
    return 0;
  }

  for (const file of files) {
    const relative = path.relative(prerenderRoot, file);
    const label = `prerendered ${relative}`;
    const html = fs.readFileSync(file, 'utf8');
    const relativeParts = relative.split(path.sep);
    const contentSlug = relativeParts[0] === 'content' ? relativeParts[1] : undefined;
    const isBlogSnapshot = relativeParts[0] === 'blog';
    // Shared marketing claims are checked in raw HTML so JSON-LD and other
    // machine-readable blocks cannot bypass the same publication rules.
    const pageSlug = contentSlug || (relativeParts[0] === 'index.html' ? 'index' : relativeParts[0]);
    for (const issue of browserTextGuardrailIssues(html, pageSlug, { numeric: !isBlogSnapshot })) {
      fail(`${label}: ${issue}`);
    }
    // Blog numeric claims are validated against rendered article fields by
    // validate-blog-snapshot-guardrails.mjs; browser UI prices are still checked
    // above. Other routes also receive all numeric rendered-text checks.
    if (/"@type"\s*:\s*"LegalService"/.test(html)) {
      fail(`${label}: Fabsy must not be represented as a LegalService`);
    }
    if (hasDisallowedOfferPricing(html)) {
      fail(`${label}: Fabsy Offer schema contains an unapproved fixed price`);
    }
    if (/\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?555[ .-]?\d{4}\b/.test(html)) {
      fail(`${label}: placeholder telephone number`);
    }
    if (hasDisallowedRatingOrReviewSchema(html)) {
      fail(`${label}: fabricated rating or review schema`);
    }

    const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((match) => tagText(match[1]));
    if (titles.length !== 1 || !titles[0] || titles[0].length > 60) {
      fail(`${label}: must contain one title of at most 60 characters`);
    }
    const descriptionTags = [...html.matchAll(/<meta\b[^>]*name=["']description["'][^>]*>/gi)];
    const description = metaContent(html, 'description');
    if (
      descriptionTags.length !== 1 ||
      !description ||
      description.length > 155
    ) {
      fail(`${label}: must contain one meta description of at most 155 characters`);
    }
    const canonicalTags = [...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)];
    if (canonicalTags.length > 1 || (relative !== 'thank-you/index.html' && canonicalTags.length !== 1)) {
      fail(`${label}: canonical link count is invalid`);
    }
    const robotsTags = [...html.matchAll(/<meta\b[^>]*name=["']robots["'][^>]*>/gi)];
    if (robotsTags.length !== 1) fail(`${label}: must contain exactly one robots directive`);

    const text = renderedPageText(html);
    if (/\$(?:149|339|488)\b|\b30%\b/.test(text)) {
      fail(`${label}: legacy Fabsy pricing remains in rendered content`);
    }
  }

  const sitemapDir = path.join(ROOT, 'public/sitemaps');
  const sitemapFiles = fs.existsSync(sitemapDir)
    ? fs.readdirSync(sitemapDir).filter((file) => file.endsWith('.xml')).sort()
    : [];
  const sitemapUrls = [];
  for (const sitemapFile of sitemapFiles) {
    const xml = fs.readFileSync(path.join(sitemapDir, sitemapFile), 'utf8');
    for (const match of xml.matchAll(/<loc>(https:\/\/fabsy\.ca(?:\/[^<]*)?)<\/loc>/g)) {
      sitemapUrls.push(match[1]);
    }
  }
  const seenUrls = new Set();
  for (const value of sitemapUrls) {
    if (seenUrls.has(value)) {
      fail(`sitemap URL is duplicated: ${value}`);
      continue;
    }
    seenUrls.add(value);
    const pathname = new URL(value).pathname.replace(/\/+$/, '') || '/';
    const snapshot = pathname === '/'
      ? path.join(prerenderRoot, 'index.html')
      : pathname === '/faq'
        ? path.join(prerenderRoot, 'faq.html')
        : path.join(prerenderRoot, ...pathname.split('/').filter(Boolean), 'index.html');
    if (!fs.existsSync(snapshot)) {
      fail(`sitemap URL is missing a crawler snapshot: ${value}`);
      continue;
    }

    const html = fs.readFileSync(snapshot, 'utf8');
    if (metaContent(html, 'robots').toLowerCase() !== 'index, follow') {
      fail(`sitemap URL snapshot is not indexable: ${value}`);
    }
    const canonicalTag = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.exec(html)?.[0] || '';
    const canonical = /href=["']([^"']+)["']/i.exec(canonicalTag)?.[1] || '';
    if (decodeHtml(canonical) !== value) {
      fail(`sitemap URL snapshot canonical mismatch: ${value}`);
    }
  }

  for (const file of files) {
    const relative = path.relative(prerenderRoot, file);
    if (relative.startsWith(`content${path.sep}`)) continue;
    let pathname;
    if (relative === 'index.html') pathname = '/';
    else if (relative === 'faq.html') pathname = '/faq';
    else if (relative.endsWith(`${path.sep}index.html`)) {
      pathname = `/${relative.split(path.sep).slice(0, -1).join('/')}`;
    } else {
      fail(`browser snapshot has an unexpected file layout: ${relative}`);
      continue;
    }
    const publicUrl = `${SITE}${pathname}`;
    if (!seenUrls.has(publicUrl)) {
      fail(`browser snapshot is not represented in a sitemap: ${publicUrl}`);
    }
  }
  for (const excluded of ['thank-you', 'proof']) {
    if (fs.existsSync(path.join(prerenderRoot, excluded))) {
      fail(`excluded route retains a crawler snapshot: /${excluded}`);
    }
  }
  return files.length;
}

function run() {
  const dbInventory = readSourceInventory(DB_DIR, 'page_content');
  const curatedInventory = readSourceInventory(CURATED_DIR, 'curated');
  if (dbInventory.slugs.length === 0) fail('page_content source contains zero usable rows');
  const curatedValidation = validateCuratedPages(curatedInventory, dbInventory);
  const snapshotCount = validateSnapshots(dbInventory, curatedInventory, curatedValidation);
  const allPrerenderedCount = validateAllPrerendered();

  if (errors.length) {
    console.error(`Snapshot guardrail validation failed with ${errors.length} issue(s):`);
    errors.forEach((error) => console.error(` - ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Snapshot guardrails valid: ${curatedValidation.count} curated input(s), ${snapshotCount} generated content snapshot(s), ${allPrerenderedCount} full-tree snapshot(s).`
  );
}

if (require.main === module) run();

module.exports = {
  browserTextGuardrailIssues,
  containsDisallowedOfferPricing,
  redactBrowserCommercialFacts,
};
