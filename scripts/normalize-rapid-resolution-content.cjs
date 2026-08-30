#!/usr/bin/env node

/**
 * Normalize public ticket-content JSON to Fabsy's current offers and claim rules.
 *
 * The Supabase page_content table still contains legacy marketing copy. This
 * module is deliberately shared by the database sync and the one-off corpus
 * command so a prebuild cannot reintroduce that copy after a local cleanup.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OFFERS = require(path.join(ROOT, 'src/config/offers.json'));

const CANONICAL_PRICING_COPY = OFFERS.canonicalPricingCopy;
const CANONICAL_PRICE_RANGE_COPY = `$${OFFERS.insuranceReport.priceCad}–$${OFFERS.bundle.priceCad} CAD plus applicable GST`;
const RAPID_RESOLUTION_NAME = OFFERS.rapidResolution.name;
const RAPID_RESOLUTION_ONE_LINE = OFFERS.rapidResolution.oneLineDescription;
const RAPID_RESOLUTION_ACTION_COMMITMENT = OFFERS.rapidResolution.actionCommitment;
const RAPID_RESOLUTION_SPEED_DISCLAIMER = OFFERS.rapidResolution.speedDisclaimer;
const RAPID_RESOLUTION_OUTCOME_DISCLAIMER = OFFERS.rapidResolution.outcomeDisclaimer;
const INSURANCE_REPORT_NAME = OFFERS.insuranceReport.name;
const INSURANCE_REPORT_DESCRIPTION = OFFERS.insuranceReport.description;
const INSURANCE_REPORT_DISCLAIMER = OFFERS.insuranceReport.disclaimer;

const OLD_PRICING_PATTERNS = [
  /Representation uses a \$488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced\./gi,
  /It costs a flat \$488 for representation, plus 30 percent of any fine reduction we achieve\. No additional charge if the fine is not reduced\./gi,
  /A flat \$488 for representation, plus 30 percent of any fine reduction we achieve\. No additional charge if the fine is not reduced\./gi,
  /A flat \$488\. Fabsy also charges 30 percent of any fine reduction achieved, with no additional charge if the fine is not reduced\./gi,
  /For eligible matters, pricing is a flat \$488 plus 30 percent of any fine reduction achieved\. There is no additional charge if the fine is not reduced\./gi,
  /Pricing is a flat \$488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced\./gi,
];

function cleanOfferText(value) {
  let text = String(value ?? '');
  for (const pattern of OLD_PRICING_PATTERNS) text = text.replace(pattern, CANONICAL_PRICING_COPY);
  return text
    .replace(/\bTicket Triage\b/gi, RAPID_RESOLUTION_NAME)
    .replace(/\bPriority(?: Ticket)? Review\b/gi, RAPID_RESOLUTION_NAME)
    .replace(/\bFree Ticket (?:Check|Review|Analysis)\b/gi, 'Representation Eligibility Check')
    .replace(/\bfree ticket (?:check|review|analysis)\b/gi, 'Representation Eligibility Check');
}

function fit(value, maximum) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maximum) return text;
  const candidate = text.slice(0, maximum - 1);
  const lastSpace = candidate.lastIndexOf(' ');
  return `${candidate.slice(0, lastSpace > maximum * 0.65 ? lastSpace : maximum - 1).replace(/[\s,;:.!?-]+$/, '')}.`;
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bRcmp\b/g, 'RCMP');
}

function safeCity(page) {
  const city = typeof page?.city === 'string' ? page.city.trim() : '';
  return /^[A-Za-z][A-Za-z .'-]{1,58}$/.test(city) ? city : 'Alberta';
}

function safeViolation(page) {
  const supplied = typeof page?.violation === 'string'
    ? page.violation.trim().replace(/\s+ticket$/i, '')
    : '';
  if (/^[A-Za-z][A-Za-z0-9 /&'-]{1,70}$/.test(supplied)) return titleCase(supplied);

  const slug = typeof page?.slug === 'string' ? page.slug.toLowerCase() : '';
  const ticketMatch = slug.match(/^(?:fight-|dispute-)?(.+?)-ticket(?:-|$)/)?.[1];
  const fallback = ticketMatch || slug
    .replace(/^(?:fight-|dispute-)/, '')
    .replace(/-(?:alberta|calgary|edmonton|red-deer|lethbridge|medicine-hat|fort-mcmurray)$/, '');
  return fallback ? titleCase(fallback.replace(/-/g, ' ')) : 'Traffic';
}

function safeH1(page) {
  const city = safeCity(page);
  const violation = safeViolation(page);
  const place = city === 'Alberta' ? 'Alberta' : city;
  return `${violation} Ticket in ${place}`;
}

function metaTitle(h1) {
  const suffix = ' | Fabsy';
  return `${fit(h1, 60 - suffix.length)}${suffix}`;
}

function canonicalFaqs() {
  return [
    {
      q: `What does ${RAPID_RESOLUTION_NAME} include?`,
      a: 'Secure digital intake and authorization, a disclosure request, technology-assisted disclosure analysis with qualified review, a fact-specific prosecutor-review submission, immediate file updates and a plain-language comparison of any Crown response.',
    },
    {
      q: `When does ${RAPID_RESOLUTION_NAME}'s action clock begin?`,
      a: RAPID_RESOLUTION_SPEED_DISCLAIMER,
    },
    {
      q: `Does ${RAPID_RESOLUTION_NAME} promise a withdrawal or reduction?`,
      a: RAPID_RESOLUTION_OUTCOME_DISCLAIMER,
    },
    {
      q: `Is trial representation included in ${RAPID_RESOLUTION_NAME}?`,
      a: 'No. Rapid Resolution covers an eligible Alberta pre-trial matter. Trial representation is separate and may be quoted case by case if the matter does not resolve.',
    },
    {
      q: 'How much do Fabsy products cost?',
      a: CANONICAL_PRICING_COPY,
    },
    {
      q: `What is the ${INSURANCE_REPORT_NAME}?`,
      a: `${INSURANCE_REPORT_DESCRIPTION} ${INSURANCE_REPORT_DISCLAIMER}`,
    },
  ];
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

function rapidResolutionHow() {
  return `<h2>How ${RAPID_RESOLUTION_NAME} works</h2><ol><li><strong>Secure intake and authorization.</strong> Upload the ticket and complete the digital consent and authorization so Fabsy can check eligibility and the printed deadline.</li><li><strong>Disclosure request and tracking.</strong> Fabsy requests the available disclosure and tracks it to the file.</li><li><strong>Disclosure analysis and prosecutor review.</strong> Fabsy uses technology-assisted analysis with qualified review to prepare a fact-specific request. ${RAPID_RESOLUTION_ACTION_COMMITMENT}</li><li><strong>Immediate client updates.</strong> Fabsy notifies the client when the file changes, explains any Crown response in plain language and follows the client's authorized direction.</li></ol>`;
}

function rapidResolutionNext() {
  return `<h2>Start ${RAPID_RESOLUTION_NAME}</h2><p>Upload a readable copy of the ticket and complete the digital authorization before the deadline printed on the ticket. ${RAPID_RESOLUTION_ONE_LINE}</p><p>${CANONICAL_PRICING_COPY}</p><p>${RAPID_RESOLUTION_SPEED_DISCLAIMER}</p><p>${RAPID_RESOLUTION_OUTCOME_DISCLAIMER}</p>`;
}

function normalizeCachePage(page) {
  const h1 = safeH1(page);
  const city = safeCity(page);
  const violation = safeViolation(page).toLowerCase();
  const place = city === 'Alberta' ? 'in Alberta' : `in ${city}`;
  const faqs = canonicalFaqs();

  return {
    slug: String(page?.slug || '').trim(),
    meta_title: metaTitle(h1),
    meta_description: fit(`${RAPID_RESOLUTION_NAME} for a ${violation} ticket ${place}: secure intake, disclosure analysis, prosecutor review and immediate client updates.`, 155),
    h1,
    hook: 'Check the response deadline printed on the ticket. Fabsy can begin secure intake and authorization immediately for an eligible Alberta pre-trial matter.',
    bullets: [
      'Secure digital ticket intake, eligibility review and authorization.',
      'Disclosure request, document tracking and technology-assisted analysis with qualified review.',
      RAPID_RESOLUTION_ACTION_COMMITMENT,
      'Immediate client notifications and a plain-language comparison of any Crown response.',
      'Trial representation, government fines and out-of-scope matters are separate.',
    ],
    what: `<h2>What ${RAPID_RESOLUTION_NAME} is</h2><p>Fabsy provides an end-to-end agent service for eligible Alberta pre-trial traffic matters. Fabsy is not a law firm. The service starts with secure digital intake and authorization, then moves through disclosure review, a fact-specific prosecutor-review request and immediate client updates.</p><p>Keep a readable copy of the ticket and follow the response deadline printed on it. Eligibility, procedure and available outcomes depend on the individual matter.</p>`,
    how: rapidResolutionHow(),
    next: rapidResolutionNext(),
    content: '',
    local_info: `Fabsy serves eligible Alberta traffic matters ${place} where paid agent representation is permitted. Service eligibility and procedure depend on the charge and court location.`,
    city: typeof page?.city === 'string' ? page.city : '',
    violation: typeof page?.violation === 'string' ? page.violation : '',
    stats: {},
    faqs,
    video: page?.video ?? null,
    jsonld: JSON.stringify(faqJsonLd(faqs)),
    created_at: page?.created_at ?? null,
    updated_at: page?.updated_at ?? null,
  };
}

function normalizeCuratedPage(page) {
  const faqs = canonicalFaqs();
  const fallback = normalizeCachePage(page);
  const normalized = {};
  for (const [key, value] of Object.entries(page || {})) {
    if (typeof value === 'string') normalized[key] = cleanOfferText(value);
    else if (Array.isArray(value)) normalized[key] = value.map((item) =>
      typeof item === 'string' ? cleanOfferText(item) : item
    );
    else normalized[key] = value;
  }

  const rapidResolutionHeading = `<h2>How ${RAPID_RESOLUTION_NAME} works</h2>`;
  const originalHow = cleanOfferText(page?.how || '').split(rapidResolutionHeading)[0];
  normalized.meta_title = String(normalized.meta_title || fallback.meta_title).trim();
  normalized.meta_description = fit(normalized.meta_description || fallback.meta_description, 155);
  normalized.h1 = String(normalized.h1 || fallback.h1).trim();
  normalized.hook = String(normalized.hook || fallback.hook).trim();
  normalized.bullets = Array.isArray(normalized.bullets) && normalized.bullets.length
    ? normalized.bullets.map(String)
    : fallback.bullets;
  normalized.what = String(normalized.what || fallback.what);
  normalized.how = `${originalHow}${rapidResolutionHow()}`;
  normalized.next = rapidResolutionNext();
  normalized.faqs = faqs;
  normalized.jsonld = JSON.stringify(faqJsonLd(faqs));
  return normalized;
}

function normalizePageObject(page, options = {}) {
  return options.curated ? normalizeCuratedPage(page) : normalizeCachePage(page);
}

function normalizeDirectory(directory, options) {
  if (!fs.existsSync(directory)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = path.join(directory, entry.name);
    const page = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = normalizePageObject(page, options);
    fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    count += 1;
  }
  return count;
}

function run() {
  const cacheCount = normalizeDirectory(path.join(ROOT, 'src/content/pages'), { curated: false });
  const curatedCount = normalizeDirectory(path.join(ROOT, 'ssg-pages'), { curated: true });
  console.log(`Rapid Resolution content normalization complete: ${cacheCount} cache page(s), ${curatedCount} curated page(s).`);
}

if (require.main === module) run();

module.exports = {
  CANONICAL_PRICE_RANGE_COPY,
  CANONICAL_PRICING_COPY,
  INSURANCE_REPORT_NAME,
  RAPID_RESOLUTION_ACTION_COMMITMENT,
  RAPID_RESOLUTION_NAME,
  RAPID_RESOLUTION_ONE_LINE,
  RAPID_RESOLUTION_OUTCOME_DISCLAIMER,
  RAPID_RESOLUTION_SPEED_DISCLAIMER,
  canonicalFaqs,
  cleanOfferText,
  faqJsonLd,
  normalizePageObject,
};
