/** Exact commercial scope for the owner-authorized homepage promotion. */
const { textGuardrailIssues } = require('./curated-content-guardrails.cjs');
const PROMOTION_ID = 'pro-driver-20';
const PROMOTION_CLASSES = ['1', '2', '4'];
const PROMOTION_PRODUCTS = ['rapid_resolution', 'rapid_resolution_insurance_bundle'];
const PROMOTION_KEYS = ['appliesTo', 'combinable', 'detailsPath', 'eligibleLicenceClasses', 'eligibleTicketType', 'id', 'licenceProvince', 'percentOff', 'verificationRequired'];
const LOCALES = new Set(['en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es']);

function proDriverPromotionValues(offers) {
  const promotion = offers?.proDriverPromotion;
  const rapid = offers?.rapidResolution;
  const bundle = offers?.bundle;
  if (!promotion || JSON.stringify(Object.keys(promotion).sort()) !== JSON.stringify(PROMOTION_KEYS) ||
      promotion.id !== PROMOTION_ID || promotion.percentOff !== 20 ||
      promotion.verificationRequired !== true || promotion.combinable !== false ||
      promotion.licenceProvince !== 'AB' || promotion.eligibleTicketType !== 'officer' || promotion.detailsPath !== '/pro-drivers' ||
      !Array.isArray(promotion.eligibleLicenceClasses) ||
      JSON.stringify([...promotion.eligibleLicenceClasses].sort()) !== JSON.stringify(PROMOTION_CLASSES) ||
      !Array.isArray(promotion.appliesTo) || JSON.stringify([...promotion.appliesTo].sort()) !== JSON.stringify(PROMOTION_PRODUCTS) ||
      rapid?.name !== 'Rapid Resolution' || rapid?.priceCents !== 19800 || rapid?.priceCad !== 198 ||
      rapid?.currency !== 'CAD' || rapid?.taxTreatment !== 'plus applicable GST' || rapid?.intakePath !== '/submit-ticket' ||
      bundle?.priceCents !== 22900 || bundle?.priceCad !== 229 || bundle?.currency !== 'CAD' || bundle?.taxTreatment !== 'plus applicable GST') {
    throw new Error('Pro Driver promotion must remain the authorized verified Alberta Class 1/2/4, officer-ticket 20% discount');
  }
  const savingsCents = Math.round(rapid.priceCents * promotion.percentOff / 100);
  const priceCents = rapid.priceCents - savingsCents;
  const bundlePriceCents = bundle.priceCents - Math.round(bundle.priceCents * promotion.percentOff / 100);
  return {
    id: promotion.id,
    priceCents,
    savingsCents,
    bundlePriceCents,
    regularPrice: `$${rapid.priceCad}`,
    discountedPrice: `$${(priceCents / 100).toFixed(2)}`,
    taxTreatment: `CAD ${rapid.taxTreatment}`,
    translationValues: {
      proDiscountPercent: String(promotion.percentOff),
      proDiscountPrice: `$${(priceCents / 100).toFixed(2)}`,
      proSavings: `$${(savingsCents / 100).toFixed(2)}`,
      proBundlePrice: `$${(bundlePriceCents / 100).toFixed(2)}`,
    },
  };
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function visibleText(value) {
  return String(value).replace(/<\/?bdi\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function attribute(tag, name) {
  const matches = [...tag.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'gi'))];
  return matches.length === 1 ? matches[0][2] : null;
}

function proDriverSectionContract(offers, translate, code) {
  if (!LOCALES.has(code)) throw new Error(`Unsupported promotion locale: ${code}`);
  const values = proDriverPromotionValues(offers);
  const copy = Object.fromEntries(['eyebrow', 'title', 'description', 'scope', 'regularPrice', 'discountedPrice', 'savings', 'bundlePrice', 'cta', 'claimHint', ...(code === 'en' ? [] : ['englishDetails'])].map(key => {
    const text = translate(`proDriver.${key}`);
    if (typeof text !== 'string' || !text.trim() || /\{\{|\}\}/.test(text) || text === `proDriver.${key}`) throw new Error(`Missing promotion translation: ${code}:${key}`);
    return [key, text];
  }));
  const route = code === 'en' ? '/' : `/${code}/`;
  const href = offers.proDriverPromotion.detailsPath;
  const regularPrice = `${values.regularPrice} CAD`;
  const discountedPrice = `${values.discountedPrice} CAD + GST`;
  const text = [copy.eyebrow, copy.title, copy.description, copy.scope, copy.regularPrice, regularPrice,
    copy.discountedPrice, discountedPrice, copy.savings, copy.bundlePrice, copy.cta, copy.claimHint, ...(code === 'en' ? [] : [copy.englishDetails])].join(' ');
  return { ...values, copy, route, href, regularPrice, discountedPrice, text: visibleText(escapeHtml(text)) };
}

/** Plain snapshot equivalent of ProDriverSection; ordinary Offer schema stays unchanged. */
function renderProDriverSnapshot(offers, translate, code) {
  const contract = proDriverSectionContract(offers, translate, code);
  const { copy } = contract;
  const isolatedPrices = text => escapeHtml(text).replace(/\$\d+(?:\.\d+)?/g, amount => `<bdi dir="ltr">${amount}</bdi>`);
  return `<section data-promotion="${PROMOTION_ID}" aria-labelledby="pro-driver-heading"><p>${escapeHtml(copy.eyebrow)}</p><h2 id="pro-driver-heading">${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.description)}</p><p>${escapeHtml(copy.scope)}</p><p>${escapeHtml(copy.regularPrice)} <s dir="ltr">${escapeHtml(contract.regularPrice)}</s></p><p>${escapeHtml(copy.discountedPrice)}</p><p dir="ltr">${escapeHtml(contract.discountedPrice)}</p><p>${isolatedPrices(copy.savings)}</p><p>${isolatedPrices(copy.bundlePrice)}</p><a href="${contract.href}">${escapeHtml(copy.cta)}</a><p>${escapeHtml(copy.claimHint)}</p>${code === 'en' ? '' : `<p>${escapeHtml(copy.englishDetails)}</p>`}</section>`;
}

/**
 * Admit one complete, source-matched homepage section only. A marker alone,
 * matching amount elsewhere, missing scope, extra claim or different link
 * never licenses a monetary/percentage exception.
 */
function redactProDriverPromotion(html, { offers, translate, code = 'en', route, required = false }) {
  const original = String(html);
  const markers = [...original.matchAll(/\bdata-promotion\s*=/gi)];
  if (!markers.length) return { html: original, issues: required ? ['required Pro Driver homepage promotion is missing'] : [] };
  const contract = proDriverSectionContract(offers, translate, code);
  if (route !== contract.route) return { html: original, issues: ['Pro Driver promotion is only permitted on its language homepage'] };
  const sections = [...original.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)]
    .filter(match => attribute(match[0].match(/^<section\b[^>]*>/i)[0], 'data-promotion') === PROMOTION_ID);
  if (markers.length !== 1 || sections.length !== 1) return { html: original, issues: ['Pro Driver promotion must have one exact section marker'] };
  const section = sections[0][0];
  const marketingIssues = textGuardrailIssues(section, undefined, { numeric: false })
    .filter(issue => issue !== 'partial or inexact Fabsy pricing');
  if (marketingIssues.length) return { html: original, issues: marketingIssues };
  const opening = section.match(/^<section\b[^>]*>/i)[0];
  const headings = [...section.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const links = [...section.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
  const crossedOut = [...section.matchAll(/<s\b[^>]*>([\s\S]*?)<\/s>/gi)];
  const invalidBidi = [...section.matchAll(/<bdi\b[^>]*>/gi)].some(match => attribute(match[0], 'dir') !== 'ltr');
  const unsafeMarkup = /<(?:script|style|template|noscript|iframe|object|embed|form|input|button|meta|link)\b|\bon\w+\s*=|javascript\s*:|\s(?:aria-label|aria-description|title|alt)\s*=/i.test(section);
  if (unsafeMarkup || invalidBidi || visibleText(section) !== contract.text ||
      attribute(opening, 'aria-labelledby') !== 'pro-driver-heading' ||
      headings.length !== 1 || attribute(headings[0][0].match(/^<h2\b[^>]*>/i)[0], 'id') !== 'pro-driver-heading' ||
      visibleText(headings[0][1]) !== visibleText(escapeHtml(contract.copy.title)) ||
      links.length !== 1 || attribute(links[0][0].match(/^<a\b[^>]*>/i)[0], 'href') !== contract.href ||
      visibleText(links[0][1]) !== visibleText(escapeHtml(contract.copy.cta)) ||
      crossedOut.length !== 1 || visibleText(crossedOut[0][1]) !== contract.regularPrice) {
    return { html: original, issues: ['Pro Driver promotion differs from its exact price, eligibility, scope or checkout contract'] };
  }
  const index = sections[0].index;
  return { html: original.slice(0, index) + '<section>[verified Pro Driver promotion]</section>' + original.slice(index + section.length), issues: [] };
}

module.exports = { PROMOTION_ID, proDriverPromotionValues, proDriverSectionContract, renderProDriverSnapshot, redactProDriverPromotion };
