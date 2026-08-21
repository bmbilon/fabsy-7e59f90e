export const EXACT_FABSY_PRICING =
  'Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.';

export const SAFE_BLOG_FALLBACK_TITLE = 'How to Respond to an Alberta Traffic Ticket';
export const SAFE_BLOG_FALLBACK_DESCRIPTION =
  'Review general options for responding to an Alberta traffic ticket and learn when Fabsy may provide authorized agent services.';

export const SAFE_BLOG_FALLBACK_ARTICLE = `Traffic ticket rules, procedures, and available outcomes depend on the allegation, the evidence, the court location, and current Alberta requirements. Numerical penalties and deadlines can change, so check the notice you received and current official sources before deciding what to do.

## Start with the ticket

Read the ticket carefully and keep a copy. Confirm the alleged offence, the court location, and the response deadline printed on the notice. Gather any photographs, video, documents, or other records that may be relevant.

## Review current official information

Use current Alberta government and Alberta Court of Justice information for procedural details. An old article or a result from another matter may not apply to your ticket.

## Consider your options

Depending on the matter, you may be able to respond yourself, use an authorized traffic-ticket agent where permitted, or consult a lawyer when legal advice or a broader scope of representation is required. No service can predict the result of an individual matter.

Fabsy provides agent services for Alberta traffic matters and is not a law firm. ${EXACT_FABSY_PRICING}

## Get a free ticket check

To ask Fabsy to confirm the charge, check representation availability and quote the representation fee, [submit your ticket](https://fabsy.ca/submit-ticket) before the response deadline printed on it.

This article provides general information and is not legal advice.`;

export const SAFE_COMPARISON_ARTICLE = `An Alberta traffic ticket can usually be handled by responding yourself, hiring an authorized agent where permitted, or consulting a lawyer when the matter requires legal advice or falls outside an agent's permitted scope.

## Start with the ticket itself

Read the notice carefully before choosing a path. Confirm the alleged offence, the court location, and the response deadline printed on the ticket. Keep the original notice and related records together. If you are unsure what a field means, check current Alberta government and Alberta Court of Justice information rather than relying on an old online summary.

The best response depends on the allegation, the available evidence, your driving record, and what outcome matters most to you. No service can predict the result of an individual matter.

## Option 1: Respond on your own

Self-representation can make sense when you are comfortable reviewing the ticket instructions, requesting available material, and managing the process yourself. The ticket explains how to pay or dispute it. Current court information can help you understand the available channels.

The main tradeoff is time. You remain responsible for following the instructions, tracking dates, reviewing the evidence, and appearing when required. Before acting, make sure you understand what the allegation could mean for your driving record.

## Option 2: Use an authorized traffic-ticket agent

An authorized agent may be able to review the ticket and disclosure, handle paperwork, discuss available options, and provide representation where Alberta rules permit. Ask any provider to explain its scope, pricing, communication process, and what happens if personal attendance is required.

Fabsy provides agent services for Alberta traffic matters and is not a law firm. ${EXACT_FABSY_PRICING} Outcomes vary, and past results do not predict a future result.

## Option 3: Consult a lawyer

A lawyer may be appropriate when you need legal advice, the allegation overlaps with a criminal matter, there is a risk of imprisonment, an appeal is involved, or the matter is outside an agent's authorized scope. Ask about scope and fees before retaining anyone.

Fabsy checks whether agent representation is permitted for a submitted matter. If the matter falls outside that scope, the appropriate next step may be to contact a lawyer.

## How to compare service providers

Use verifiable criteria instead of marketing superlatives:

- **Status and scope:** Ask whether the provider is acting as an agent or a law firm and what work it is permitted to perform.
- **Pricing:** Request the complete fee formula in writing, including any amount tied to a fine reduction.
- **Process:** Ask who reviews the disclosure, who communicates with you, and whether the named representative will attend when required.
- **Evidence:** Treat testimonials and historical statistics as context, not as a prediction for your matter.
- **Communication:** Confirm how updates are delivered and how quickly questions are answered.

Avoid choosing a provider because of a promised outcome. Traffic matters turn on their own facts, evidence, procedure, and current law.

## Questions to ask before deciding

1. What services are included?
2. Is representation permitted for this charge and court location?
3. What is the full pricing formula?
4. Will I need to attend?
5. How will I receive updates?
6. What information do you need from me?

Clear answers make it easier to compare options on the same basis.

## Frequently Asked Questions

### Is an agent the same as a lawyer?

No. An agent service is not a law firm and does not provide the same scope of services as a lawyer. Alberta rules determine when paid agent representation is permitted.

### Can I dispute an Alberta traffic ticket myself?

Yes. Follow the options and deadline printed on the ticket, and use current Alberta Court of Justice information for the applicable process.

### Does a past success rate predict my result?

No. Historical results describe past matters only. The charge, evidence, procedure, and individual facts affect each outcome.

### How much does Fabsy charge?

${EXACT_FABSY_PRICING}

## Get a free ticket check

To ask Fabsy to confirm the charge, check representation availability and quote the representation fee, [submit your ticket](https://fabsy.ca/submit-ticket) before the response deadline printed on it.

This article provides general information and is not legal advice.`;

const BANNED_PATTERNS = [
  [/\bno[\s-]*win[\s,;-]+no[\s-]*fee\b/i, 'no-win-no-fee wording'],
  [/\brisk[\s-]*free\b/i, 'risk-free wording'],
  [/\bmoney[\s-]*back\b/i, 'money-back wording'],
  [/\bguarantee(?:s|d|ing)?\b/i, 'guarantee wording'],
  [/\bzero[\s-]*risk\b/i, 'zero-risk wording'],
  [/—/, 'em dash'],
];

const LAWYER_STATUS_RE =
  /\b(?:our|fabsy(?:'s)?)\s+(?:traffic\s+)?lawyers?\b|\blawyers?\s+(?:at|from)\s+fabsy\b|\bfabsy\s+is\s+(?:a\s+)?law\s+firm\b/i;
const SEMANTIC_OVER_CAP_RE =
  /\b(?:more\s+than|over|above|greater\s+than|in\s+excess\s+of)\s*(?:9[5-9]|100)%\+?(?!\d)/i;
const OUTCOME_WORD = '(?:success(?:ful)?|win(?:s|ning)?|favourable|favorable)';
const OUTCOME_RATE = `(?:${OUTCOME_WORD}(?:\\s+rate)?|cases?\\s+(?:were\\s+)?${OUTCOME_WORD})`;
const NUMBER_WORD_TOKEN =
  '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)';
const NUMBER_WORD = `${NUMBER_WORD_TOKEN}(?:[\\s-]+${NUMBER_WORD_TOKEN}){0,4}`;
const DIGIT_OR_WORD_NUMBER = `(?:\\d[\\d,]*(?:\\.\\d+)?|${NUMBER_WORD})`;
const CALENDAR_DATE =
  '(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\\s+\\d{1,2}(?:,?\\s+\\d{4})?)';
const INEXACT_PRICING_PATTERNS = [
  /\$\s*488\b/i,
  /\b\d+(?:\.\d+)?\s*%(?!\d).{0,80}\b(?:fine\s+reduction|fines?\s+saved|savings?|amount\s+saved|fee|charge|pricing|pay|contingency)\b/i,
  /\bno[\s-]*win[\s,;-]+no[\s-]*fee\b/i,
  /\b(?:only\s+pay|pay\s+only|charged?\s+only|no\s+(?:fee|charge)|no[\s-]*win[\s,;-]+no[\s-]*fee)\b.{0,100}\b(?:if|unless|when|win|won|success|successful|succeed|save|saved|reduce|reduced|reduction|result|outcome)\b/i,
  /\b(?:if|when|unless)\b.{0,80}\b(?:win|won|success|successful|succeed|save|saved|reduce|reduced|reduction|result|outcome)\b.{0,80}\b(?:pay|fee|charge|cost)\b/i,
  /\b(?:fabsy(?:'s)?|our)\s+(?:price|pricing|fee|fees|cost|costs|charges)\b/i,
  /\b(?:we\s+(?:charge|cost)|fabsy\s+(?:charges|costs))\b/i,
  /\b(?:pricing|price|fee|fees|cost|costs|charge|charges)\s+(?:is|are|starts?|depends?|includes?)\b/i,
  /\bflat\s+(?:fee|rate|price)\b/i,
  /\b(?:pay|charged?)\s+\$\s*\d/i,
  /\b\d+(?:\.\d+)?\s*%\s+(?:contingency|success\s+fee)\b/i,
  /\b(?:contingency|success|outcome[\s-]*based|result[\s-]*based)\s+(?:price|pricing|fee|charge)\b/i,
  /\b(?:fee|charge|pricing)\s+(?:is\s+)?(?:contingent|based)\s+on\s+(?:success|the\s+outcome|the\s+result|a\s+reduction)\b/i,
  /\b(?:percentage|portion|share)\s+of\s+(?:the\s+)?(?:fine\s+reduction|savings?|amount\s+saved)\b/i,
];

const NUMERIC_LEGAL_PATTERNS = [
  [/\$\s*\d[\d,]*(?:\.\d{1,2})?\b/i, 'unsupported monetary legal claim'],
  [new RegExp(`\\b(?:CAD\\s*${DIGIT_OR_WORD_NUMBER}|${DIGIT_OR_WORD_NUMBER}\\s*(?:CAD|dollars?))\\b`, 'i'), 'unsupported monetary legal claim'],
  [new RegExp(`\\b(?:fines?|penalt(?:y|ies)|surcharges?)\\s*(?:is|are|was|were|of|at|up\\s+to|starts?\\s+at|ranges?\\s+from|could\\s+be|may\\s+be|can\\s+be|totals?|amounts?\\s+to|minimum|maximum|:)\\s*(?:CAD\\s*)?${DIGIT_OR_WORD_NUMBER}\\b`, 'i'), 'unsupported fine or penalty claim'],
  [new RegExp(`\\b${DIGIT_OR_WORD_NUMBER}\\s+(?:dollar[-\\s]+)?(?:fines?|penalt(?:y|ies)|surcharges?)\\b`, 'i'), 'unsupported fine or penalty claim'],
  [new RegExp(`\\b${DIGIT_OR_WORD_NUMBER}\\s*(?:demerits?|demerit\\s+points?|points?\\s+on\\s+(?:a|your)\\s+(?:licen[cs]e|driving\\s+record))\\b`, 'i'), 'unsupported demerit claim'],
  [new RegExp(`\\b(?:demerits?|demerit\\s+points?)\\D{0,24}${DIGIT_OR_WORD_NUMBER}\\b`, 'i'), 'unsupported demerit claim'],
  [/\b(?:within|no\s+later\s+than|up\s+to)\s+\d{1,3}\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?)\b/i, 'unsupported deadline claim'],
  [new RegExp(`\\b(?:within|no\\s+later\\s+than|up\\s+to)\\s+${NUMBER_WORD}\\s+(?:(?:business|calendar)\\s+)?(?:days?|weeks?|months?)\\b`, 'i'), 'unsupported deadline claim'],
  [/\b\d{1,3}[-\s](?:day|week|month)\s+(?:deadline|limit|window|period)\b/i, 'unsupported deadline claim'],
  [new RegExp(`\\b${NUMBER_WORD}[-\\s]+(?:day|week|month)\\s+(?:deadline|limit|window|period)\\b`, 'i'), 'unsupported deadline claim'],
  [/\b(?:deadline|time\s+limit|response\s+period)\D{0,30}\d{1,3}\s*(?:days?|weeks?|months?)\b/i, 'unsupported deadline claim'],
  [new RegExp(`\\b(?:deadline|time\\s+limit|response\\s+period)\\D{0,30}${NUMBER_WORD}\\s*(?:days?|weeks?|months?)\\b`, 'i'), 'unsupported deadline claim'],
  [/\b\d{1,3}\s+(?:days?|weeks?|months?)\s+to\s+(?:pay|respond|dispute|contest|file|appeal|request)\b/i, 'unsupported deadline claim'],
  [new RegExp(`\\b${NUMBER_WORD}\\s+(?:days?|weeks?|months?)\\s+to\\s+(?:pay|respond|dispute|contest|file|appeal|request)\\b`, 'i'), 'unsupported deadline claim'],
  [new RegExp(`\\b(?:deadline|due\\s+date|response\\s+date|court\\s+date|respond|dispute|contest|file|appeal|pay)\\D{0,36}${CALENDAR_DATE}\\b`, 'i'), 'unsupported numeric date or deadline claim'],
  [new RegExp(`\\b(?:by|before|on|no\\s+later\\s+than)\\s+${CALENDAR_DATE}\\b`, 'i'), 'unsupported numeric date or deadline claim'],
  [/\b(?:insurance|premium|premiums)\D{0,60}\d+(?:\.\d+)?\s*(?:%|percent)\b/i, 'unsupported insurance figure'],
  [/\b\d+(?:\.\d+)?\s*(?:%|percent)\D{0,60}\b(?:insurance|premium|premiums)\b/i, 'unsupported insurance figure'],
  [new RegExp(`\\b(?:insurance|premium|premiums)\\D{0,60}${NUMBER_WORD}\\s+percent\\b`, 'i'), 'unsupported insurance figure'],
  [new RegExp(`\\b${NUMBER_WORD}\\s+percent\\D{0,60}\\b(?:insurance|premium|premiums)\\b`, 'i'), 'unsupported insurance figure'],
  [new RegExp(`\\b(?:insurance|premium|premiums)\\D{0,60}${DIGIT_OR_WORD_NUMBER}\\s*(?:times?|months?|years?)\\b`, 'i'), 'unsupported insurance figure'],
  [new RegExp(`\\b${DIGIT_OR_WORD_NUMBER}\\s*(?:times?|months?|years?)\\D{0,60}\\b(?:insurance|premium|premiums)\\b`, 'i'), 'unsupported insurance figure'],
];

function withoutExactPricing(value) {
  return String(value || '').split(EXACT_FABSY_PRICING).join('');
}

export function hasInexactFabsyPricingClaim(value) {
  const candidate = withoutExactPricing(value);
  return INEXACT_PRICING_PATTERNS.some((pattern) => pattern.test(candidate));
}

export function hasFabsyPricingClaim(value) {
  return String(value || '').includes(EXACT_FABSY_PRICING) || hasInexactFabsyPricingClaim(value);
}

function stripPricingClaimsForLegalScan(value) {
  return String(value || '')
    .split('\n')
    .map((line) => {
      const withoutExact = withoutExactPricing(line);
      return hasInexactFabsyPricingClaim(withoutExact) ? '' : withoutExact;
    })
    .join('\n');
}

export function numericLegalClaimLabels(value) {
  const candidate = stripPricingClaimsForLegalScan(value);
  return [
    ...new Set(
      NUMERIC_LEGAL_PATTERNS
        .filter(([pattern]) => pattern.test(candidate))
        .map(([, label]) => label)
    ),
  ];
}

function normalizeOutcomeRates(value) {
  let result = String(value || '');
  const semantic = '(?:more\\s+than|over|above|greater\\s+than|in\\s+excess\\s+of)';
  const percent = '(?:9[5-9]|100)%\\+?';

  result = result.replace(
    new RegExp(`\\b${OUTCOME_RATE}\\s*(?:is|was|of|at|:)?\\s*${semantic}\\s*${percent}(?!\\d)`, 'gi'),
    '95%+ historical success rate'
  );
  result = result.replace(
    new RegExp(`\\b${OUTCOME_WORD}\\s+${semantic}\\s*${percent}(?:\\s+of\\s+(?:cases?|tickets?|matters?))?`, 'gi'),
    '95%+ historical success rate'
  );
  result = result.replace(
    new RegExp(`\\b${semantic}\\s*${percent}(?:\\s+(?:historical\\s+)?${OUTCOME_RATE})?`, 'gi'),
    '95%+ historical success rate'
  );
  result = result.replace(
    new RegExp(`\\b(\\d{1,3})%\\+?\\s+(?:historical\\s+)?${OUTCOME_RATE}\\b`, 'gi'),
    (match, rawRate) => Number(rawRate) > 95 ? '95%+ historical success rate' : match
  );
  result = result.replace(
    new RegExp(`\\b${OUTCOME_RATE}\\s*(?:is|was|of|at|:)?\\s*(\\d{1,3})%\\+?(?!\\d)`, 'gi'),
    (match, rawRate) => Number(rawRate) > 95 ? '95%+ historical success rate' : match
  );
  return result;
}

export function sanitizeMarketingText(value) {
  return normalizeOutcomeRates(String(value || ''))
    .replaceAll('—', ', ')
    .replace(/\bno[\s-]*win[\s,;-]+no[\s-]*fee\b/gi, 'transparent pricing')
    .replace(/\brisk[\s-]*free\b/gi, 'transparent')
    .replace(/\bmoney[\s-]*back\b/gi, 'pricing')
    .replace(/\bzero[\s-]*risk\b/gi, 'transparent pricing')
    .replace(/\b100%\s+guarantee(?:s|d|ing)?\b/gi, '95%+ historical success rate')
    .replace(/\bguarantee(?:s|d|ing)?\s+100%\s+success\b/gi, '95%+ historical success rate')
    .replace(/\bcannot be guaranteed\b/gi, 'cannot be predicted')
    .replace(/\bcan(?:not|'t) guarantee\b/gi, 'cannot predict')
    .replace(/\bdoes(?: not|n't) guarantee\b/gi, 'does not predict')
    .replace(/\bdo not guarantee\b/gi, 'do not predict')
    .replace(/\bnot guaranteed\b/gi, 'not certain')
    .replace(/\bno guarantee\b/gi, 'no certainty')
    .replace(/\bguaranteed\b/gi, 'not certain')
    .replace(/\bguaranteeing\b/gi, 'predicting')
    .replace(/\bguarantees\b/gi, 'predicts')
    .replace(/\bguarantee\b/gi, 'predict');
}

export function normalizeFabsyPricingClaims(content) {
  const normalized = [];
  let standalonePricingWritten = false;

  for (const line of String(content || '').split('\n')) {
    const prefix = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)/)?.[0] || '';
    const remainder = line.slice(prefix.length).trim();
    const hasInexactClaim = hasInexactFabsyPricingClaim(remainder);
    const isStandaloneExact = remainder === EXACT_FABSY_PRICING;

    if (hasInexactClaim || isStandaloneExact) {
      if (!standalonePricingWritten) {
        normalized.push(`${prefix}${EXACT_FABSY_PRICING}`);
        standalonePricingWritten = true;
      }
      continue;
    }
    normalized.push(line);
  }

  return normalized.join('\n');
}

export function fitMetaDescription(value) {
  const text = String(value || '');
  if (text.length <= 155) return text;
  const candidate = text.slice(0, 155);
  const lastSpace = candidate.lastIndexOf(' ');
  return `${candidate.slice(0, lastSpace > 100 ? lastSpace : 152).replace(/[\s,;:.!?-]+$/, '')}.`;
}

function fallbackPost(post) {
  const safeTitle = safeFallbackField('title', post.title);
  const safeDescription = safeFallbackField('meta_description', post.meta_description);
  return {
    ...post,
    title: safeTitle || SAFE_BLOG_FALLBACK_TITLE,
    meta_description: fitMetaDescription(safeDescription || SAFE_BLOG_FALLBACK_DESCRIPTION),
    content: SAFE_BLOG_FALLBACK_ARTICLE,
  };
}

function outcomeRateViolations(value, field) {
  const violations = [];
  if (SEMANTIC_OVER_CAP_RE.test(value)) {
    violations.push(`${field}: semantic outcome rate exceeds 95%`);
  }
  for (const match of value.matchAll(/(\d{1,3})%\+?\s+(?:historical\s+)?(?:success|win|favourable|favorable)(?:\s+rate)?/gi)) {
    if (Number(match[1]) > 95) violations.push(`${field}: outcome rate exceeds 95%`);
  }
  for (const match of value.matchAll(/(?:success|win|favourable|favorable)(?:\s+rate)?[^\d]{0,16}(\d{1,3})%\+?/gi)) {
    if (Number(match[1]) > 95) violations.push(`${field}: outcome rate exceeds 95%`);
  }
  return violations;
}

function fieldViolations(field, value) {
  const text = String(value || '');
  const violations = [];
  for (const [pattern, label] of BANNED_PATTERNS) {
    if (pattern.test(text)) violations.push(`${field}: ${label}`);
  }
  violations.push(...outcomeRateViolations(text, field));
  for (const label of numericLegalClaimLabels(text)) {
    violations.push(`${field}: ${label}`);
  }
  if (hasInexactFabsyPricingClaim(text)) {
    violations.push(`${field}: Fabsy pricing claim does not use the exact formula`);
  }
  if (LAWYER_STATUS_RE.test(text)) {
    violations.push(`${field}: lawyer-status claim`);
  }
  return violations;
}

function safeFallbackField(field, value) {
  const original = String(value || '');
  if (hasInexactFabsyPricingClaim(original)) return '';
  if (field === 'title' && hasFabsyPricingClaim(original)) return '';
  const sanitized = sanitizeMarketingText(original).trim();
  if (!sanitized || fieldViolations(field, sanitized).length > 0) return '';
  return sanitized;
}

export function articleViolations(post) {
  const fields = ['title', 'meta_description', 'content'];
  const violations = [];

  for (const field of fields) {
    const value = String(post?.[field] || '');
    violations.push(...fieldViolations(field, value));
    const renderedText = markdownToGuardrailText(value);
    if (renderedText !== value) violations.push(...fieldViolations(field, renderedText));
  }

  return [...new Set(violations)];
}

export function markdownToGuardrailText(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~]+/g, '')
    .replace(/^\s*(?:#{1,6}|>|[-+]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function guardPublishedBlogFields(post) {
  if (post.slug === 'alberta-traffic-ticket-comparison-guide') {
    return {
      ...post,
      title: 'Ways to Respond to an Alberta Traffic Ticket',
      meta_description: fitMetaDescription(
        'Compare self-representation, authorized agent services, and lawyers when deciding how to respond to an Alberta traffic ticket.'
      ),
      content: SAFE_COMPARISON_ARTICLE,
    };
  }

  const rawFields = [post.title, post.meta_description, post.content];
  if (
    rawFields.some((value) => numericLegalClaimLabels(value).length > 0) ||
    rawFields.some((value) => LAWYER_STATUS_RE.test(String(value || '')))
  ) {
    return fallbackPost(post);
  }

  const titleHadPricing = hasFabsyPricingClaim(post.title);
  const descriptionHadPricing = hasFabsyPricingClaim(post.meta_description);
  let content = normalizeFabsyPricingClaims(post.content);

  if ((titleHadPricing || descriptionHadPricing) && !content.includes(EXACT_FABSY_PRICING)) {
    content = `${content.trim()}\n\n${EXACT_FABSY_PRICING}`.trim();
  }

  const candidate = {
    ...post,
    title: titleHadPricing ? SAFE_BLOG_FALLBACK_TITLE : sanitizeMarketingText(post.title),
    meta_description: fitMetaDescription(
      descriptionHadPricing
        ? SAFE_BLOG_FALLBACK_DESCRIPTION
        : sanitizeMarketingText(post.meta_description)
    ),
    content: sanitizeMarketingText(content),
  };

  return articleViolations(candidate).length > 0 ? fallbackPost(post) : candidate;
}
