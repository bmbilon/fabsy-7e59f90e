const {
  CANONICAL_PRICE_RANGE_COPY,
  CANONICAL_PRICING_COPY: EXACT_FABSY_PRICING,
  OFFICER_PRICING_COPY,
  RAPID_RESOLUTION_ACTION_COMMITMENT,
  RAPID_RESOLUTION_ONE_LINE,
  RAPID_RESOLUTION_SPEED_DISCLAIMER,
} = require('./normalize-rapid-resolution-content.cjs');
const PHOTO_RADAR = require('../src/config/offers.json').photoRadar;
const PHOTO_RADAR_CONTENT = require('../src/config/photoRadarContent.json');
const PHOTO_RADAR_CONTENT_SLUGS = new Set(require('../src/config/photoRadarPages.json'));
const FEE_REFUND = require('../src/config/feeRefund.json');
const REVIEWED_REFUND_SOURCE_HASHES = Object.freeze({
  'src/config/feeRefund.json': 'c3548043cfe7b0a8379bb2b0f35f9c4eacf51ae8aa8969e50136cbfea7465860',
  'src/config/photoRadarContent.json': '3676436bf756d467feb2a76fee5d80abe5e16e2b04be341a95c811feb3c52940',
});
// These are reviewed business-policy passages, not a licence for arbitrary
// future config values to become legal facts. A copy change requires review.
for (const [relative, expected] of Object.entries(REVIEWED_REFUND_SOURCE_HASHES)) {
  const bytes = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', relative));
  if (require('node:crypto').createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error(`Fee-refund copy changed without updating its reviewed contract: ${relative}`);
  }
}
// Public offer pages use their separate whole-element/source contract.
// These article passages apply only to the three frozen owner-notice guides.
const PHOTO_RADAR_OFFER_SLUGS = new Set(PHOTO_RADAR_CONTENT_SLUGS);
const PHOTO_RADAR_COMPLETE_PRICE = `${PHOTO_RADAR.name} costs $${PHOTO_RADAR.priceCad} CAD plus 5% GST ($${PHOTO_RADAR.totalCad.toFixed(2)} total).`;
const PHOTO_REFUND_GUIDE_FAQ = `${PHOTO_RADAR_COMPLETE_PRICE} ${FEE_REFUND.payment} The fee covers the authorized not-guilty plea, disclosure request and review, pursuit of a Crown reduction or withdrawal and client approval of any deal. ${FEE_REFUND.photoCondition} No trial or success surcharge. Government fines are separate. See the fee refund guarantee in our Terms of Service for details.`;
const PHOTO_REFUND_GUIDE_NOTICE = `<h3>${FEE_REFUND.photoHeadline}</h3><p>${FEE_REFUND.photoCondition}</p><p>${FEE_REFUND.payment}</p><p><a href="${FEE_REFUND.termsPath}">${FEE_REFUND.details}</a>.</p>`;
const PHOTO_REFUND_GUIDE_CLAUSES = [FEE_REFUND.photoHeadline, FEE_REFUND.photoCondition, FEE_REFUND.payment, PHOTO_REFUND_GUIDE_FAQ];
const REVIEWED_RAPID_REFUND_DISCLAIMER = `Outcomes depend on the charge, evidence, procedure and prosecutor. A withdrawal, reduction, lower fine, fewer demerits or insurance result is not promised. ${FEE_REFUND.condition} Payment does not start the 30-day refund clock.`;

function redactReviewedFeeRefund(value, slug) {
  const photoGuide = PHOTO_RADAR_CONTENT_SLUGS.has(slug);
  const text = String(value ?? '');
  const rapidCopyMatches = require('../src/config/offers.json').rapidResolution.outcomeDisclaimer === REVIEWED_RAPID_REFUND_DISCLAIMER;
  const clauses = photoGuide ? PHOTO_REFUND_GUIDE_CLAUSES : rapidCopyMatches ? [REVIEWED_RAPID_REFUND_DISCLAIMER] : [];
  const approved = new Set(clauses.map(clause => clause.replace(/\s+/g, ' ').trim()));
  // An entire editorial field (FAQ answer/bullet) or an entire plain-text
  // element must match. A substring cannot excuse an appended outcome claim.
  if (!/<[^>]+>/.test(text)) return approved.has(text.replace(/\s+/g, ' ').trim()) ? '[reviewed fee-refund clause]' : text;
  let candidate = text.replace(/<(p|li|h[1-6])\b([^>]*)>([^<]*)<\/\1>/gi, (block, tag, attributes, inner) => {
    if (/\bhidden\b|\baria-hidden\s*=|\bstyle\s*=|\bon\w+\s*=/i.test(attributes) || !approved.has(visibleText(inner))) return block;
    return `<${tag}${attributes}>[reviewed fee-refund clause]</${tag}>`;
  });
  // The deterministic article renderer also emits these exact FAQ answers.
  // Do not strip arbitrary JSON strings or other properties on the question.
  const question = photoGuide ? 'What does Fabsy charge to review a photo radar notice?' : 'Does Rapid Resolution promise a withdrawal or reduction?';
  const answer = photoGuide ? PHOTO_REFUND_GUIDE_FAQ : rapidCopyMatches ? REVIEWED_RAPID_REFUND_DISCLAIMER : null;
  if (answer) candidate = candidate.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (block, open, json, close) => {
    let schema;
    try { schema = JSON.parse(json); } catch (_) { return block; }
    if (schema?.['@type'] !== 'FAQPage' || !Array.isArray(schema.mainEntity)) return block;
    for (const entry of schema.mainEntity) {
      if (entry?.['@type'] === 'Question' && entry.name === question && entry.acceptedAnswer?.['@type'] === 'Answer' && entry.acceptedAnswer.text === answer) {
        entry.acceptedAnswer.text = '[reviewed fee-refund FAQ answer]';
      }
    }
    return open + JSON.stringify(schema).replace(/</g, '\\u003c') + close;
  });
  return candidate;
}
const PHOTO_RADAR_COMMERCIAL_CLAIMS = [
  PHOTO_RADAR_COMPLETE_PRICE,
  PHOTO_RADAR.actionCommitment,
  PHOTO_RADAR.speedDisclaimer,
  ...PHOTO_RADAR_CONTENT.processSteps.map((step) => step.description),
  ...PHOTO_RADAR_CONTENT.faqs.flatMap((faq) => [faq.question, faq.answer]),
];

// Exact, reviewed passages only. Evidence and qualifications are recorded in
// docs/photo-radar/legal-sources.md. Do not approve an arbitrary amount, date,
// duration, or speed merely because it appears on a photo-radar page.
const PHOTO_RADAR_VERIFIED_COMMON_FACTS = [
  'March 2026 fine schedule',
  'Selected Alberta traffic fine increases took effect on March 13, 2026. The offence date determines which schedule applies.',
  "Alberta's current standard speeding table lists $228 for 20 km/h over and $324 for 30 km/h over, including the 20% victim surcharge.",
];
const PHOTO_RADAR_VERIFIED_EDMONTON_FACTS = [
  "Edmonton's posted playground zones are normally 30 km/h from 7:30 a.m. to 9 p.m. every day. Check the signs and any special flashing-beacon schedule at the actual location.",
  'Edmonton says multiple notices must not be issued to the same vehicle within five minutes in the same municipality.',
];
const PHOTO_RADAR_VERIFIED_CALGARY_FACTS = [
  "Calgary's playground zones are 30 km/h from 7:30 a.m. to 9 p.m. every day of the year.",
  'The March 2026 police report confirms that five Calgary intersection sites had approval to resume speed-on-green enforcement.',
  'Can I challenge two camera notices within five minutes?',
  'Upload both notices if they concern the same vehicle within five minutes. Fabsy checks the policy that applied in Calgary on the offence date before asking for duplicate-notice review.',
];

function redactReviewedPhotoRadarClaims(value, slug) {
  if (!PHOTO_RADAR_OFFER_SLUGS.has(slug)) return value;
  let text = value;
  const approved = [...PHOTO_RADAR_COMMERCIAL_CLAIMS];
  if (PHOTO_RADAR_CONTENT_SLUGS.has(slug)) {
    approved.push(...PHOTO_RADAR_VERIFIED_COMMON_FACTS);
    if (slug === 'photo-radar-ticket-alberta' || slug === 'photo-radar-ticket-edmonton') {
      approved.push(...PHOTO_RADAR_VERIFIED_EDMONTON_FACTS);
    }
    if (slug === 'fight-photo-radar-ticket-calgary') {
      approved.push(...PHOTO_RADAR_VERIFIED_CALGARY_FACTS);
    }
  }
  // Longest first avoids removing the price prefix before its complete,
  // approved FAQ passage has been recognized.
  for (const claim of approved.sort((left, right) => right.length - left.length)) {
    text = text.split(claim).join('[reviewed photo radar fact]');
  }
  return text;
}

const BANNED_PHRASE_RE =
  /(?:no\s+win\s+no\s+fee|risk[\s-]*free|money\s+back|guarantee|zero[\s-]*risk)/i;
const UNSAFE_HTML_RE =
  /<\s*(?:script|iframe|object|embed|form|input|button|style|link|meta)\b|\bon\w+\s*=|javascript\s*:/i;
const NUMBER_WORD =
  '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)';
const NUMBER_TOKEN = String.raw`(?:\d+(?:\.\d+)?|${NUMBER_WORD})`;
const CALENDAR_DATE = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,?\s+\d{4})?|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})`;

const PRICING_NUMBER_RE = /\$\s*\d|\b\d+(?:\.\d+)?\s*(?:%|percent)\b/i;
const PRICING_CONTEXT_RE =
  /\b(?:pricing|price|fees?|charges?|costs?|flat|representation|contingency|fine\s+reduction)\b/i;
const UNSUPPORTED_OUTCOME_PREVALENCE_RE =
  /\b(?:(?:most|many)\s+(?:cases|matters|disputes|tickets)\b[^.!?]{0,80}\b(?:resolve|settle|end|reduce|withdraw|dismiss|beat|win)|(?:often|commonly|usually|generally|typically)\b[^.!?]{0,80}\b(?:resolve|settle|reduce|withdraw|dismiss|drop|beat|win)|(?:resolve|settle|reduce|withdraw|dismiss|drop|beat|win)\b[^.!?]{0,80}\b(?:often|commonly|usually|generally|typically))\b/i;
const UNSUPPORTED_APPEARANCE_PREVALENCE_RE =
  /\b(?:(?:usually|generally|typically)\s+not\b[^.!?]{0,80}\b(?:appear|attend)|(?:most|every|all)\s+(?:appearances?|hearings?|traffic\s+matters?)\b|(?:agent|we)\b[^.!?]{0,50}\b(?:appear|attend|handle)\b[^.!?]{0,50}\bevery\s+(?:step|appearance))\b/i;

const UNSUPPORTED_NUMERIC_PATTERNS = [
  [/\$\s*\d[\d,]*(?:\.\d{1,2})?\b/i, 'unsupported monetary legal claim'],
  [new RegExp(`\\b(?:CAD\\s*${NUMBER_TOKEN}|${NUMBER_TOKEN}\\s*(?:CAD|dollars?))\\b`, 'i'), 'unsupported monetary legal claim'],
  [new RegExp(`\\b${NUMBER_TOKEN}(?:\\s*(?:-|to)\\s*${NUMBER_TOKEN})?[-\\s]+(?:minutes?|hours?|days?|weeks?|months?|years?)\\b`, 'i'), 'unsupported duration or deadline claim'],
  [new RegExp(`\\b${NUMBER_TOKEN}(?:\\s*(?:-|to)\\s*${NUMBER_TOKEN})?\\s*(?:demerits?|demerit\\s+points?|points?)\\b`, 'i'), 'unsupported demerit claim'],
  [new RegExp(`\\b(?:demerits?|demerit\\s+points?)\\D{0,36}\\b${NUMBER_TOKEN}\\b`, 'i'), 'unsupported demerit claim'],
  [new RegExp(`\\b${NUMBER_TOKEN}\\s*(?:km/h|kilometres?\\s+per\\s+hour)\\b`, 'i'), 'unsupported speed threshold claim'],
  [/\b\d+(?:\.\d+)?\s*(?:%(?:\+)?(?!\w)|percent\b)/i, 'unsupported percentage claim'],
  [new RegExp(`\\b(?:fines?|penalt(?:y|ies)|surcharges?)\\D{0,36}\\b${NUMBER_TOKEN}\\b`, 'i'), 'unsupported fine or penalty claim'],
  [new RegExp(`\\b${CALENDAR_DATE}\\b`, 'i'), 'unsupported numeric date claim'],
];

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function visibleText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(?:nbsp|quot|apos|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCompleteFabsyPricing(value, slug) {
  const text = visibleText(value);
  return text.includes(EXACT_FABSY_PRICING) ||
    (!PHOTO_RADAR_CONTENT_SLUGS.has(slug) && text.includes(OFFICER_PRICING_COPY));
}

function hasFabsyPricingMarker(value) {
  const text = visibleText(value);
  return PRICING_NUMBER_RE.test(text) && PRICING_CONTEXT_RE.test(text);
}

function replaceWhenNearby(text, pattern, context, replacement) {
  return text.replace(pattern, (match, offset, source) => {
    const start = Math.max(0, offset - 140);
    const end = Math.min(source.length, offset + match.length + 140);
    return context.test(source.slice(start, end)) ? replacement : match;
  });
}

function redactSlugVerifiedFacts(value, slug) {
  let text = value;
  switch (slug) {
    case 'distracted-driving-ticket-alberta':
      // Official sources: Alberta.ca "Distracted driving" and the current Alberta Driver's Guide.
      text = replaceWhenNearby(
        text,
        /\$\s*390\b/gi,
        /\b(?:distracted\s+driving|penalt(?:y|ies))\b/i,
        '[verified distracted-driving penalty]'
      ).replace(
        /\b(?:3|three)\s+demerit(?:s|\s+points?)\b/gi,
        '[verified distracted-driving demerits]'
      );
      break;
    case 'careless-driving-ticket-alberta':
      // Official sources: Alberta's demerit-driving-suspension page and current Alberta Driver's Guide.
      text = text.replace(
        /\b(?:6|six)(?:[-\s]+(?:demerits?|demerit\s+points?|points?))\b/gi,
        '[verified careless-driving fact]'
      );
      text = replaceWhenNearby(
        text,
        /\b(?:2|two)\s+years?\b/gi,
        /\b(?:demerit|points?|record|abstract|conviction)\b/i,
        '[verified demerit record period]'
      );
      break;
    case 'demerit-points-alberta':
      // Official source: Alberta.ca "Demerit driving suspension" (record period, thresholds,
      // warning levels, first-suspension duration, and approved-course point reduction).
      text = replaceWhenNearby(
        text,
        /\b(?:2|two)\s+years?\b/gi,
        /\b(?:demerit|points?|record|abstract|conviction|course|suspension)\b/i,
        '[verified demerit period]'
      );
      text = replaceWhenNearby(
        text,
        /\b(?:1|one)[-\s]+month\b/gi,
        /\bsuspension\b/i,
        '[verified first-suspension duration]'
      );
      text = replaceWhenNearby(
        text,
        /\b(?:3|three)\s+points?\b/gi,
        /\b(?:approved|defensive|professional)\b[^.!?]{0,80}\b(?:course|driver\s+improvement)\b/i,
        '[verified approved-course reduction]'
      );
      text = text
        .replace(/\b8\s*(?:to|-)\s*14\s+points?\b/gi, '[verified full-licence warning band]')
        .replace(/\b4\s*(?:to|-)\s*7(?:\s+points?)?\b/gi, '[verified GDL warning band]')
        .replace(/\b8\s+points?\s+for\s+full\s+licen[cs]es?\s+and\s+4\s+points?\s+for\s+GDL\s+licen[cs]es?\b/gi, '[verified warning levels]')
        .replace(/\b(?:15|fifteen)\s+or\s+more\s+points?\b/gi, '[verified full-licence suspension threshold]')
        .replace(/\b(?:8|eight)\s+or\s+more\s+points?\b/gi, '[verified GDL suspension threshold]');
      break;
    case 'red-light-ticket-alberta':
      // Official sources: Alberta.ca "Intersection safety devices" and the current Driver's Guide.
      text = text.replace(
        /\b(?:3|three)\s+demerit(?:s|\s+points?)\b/gi,
        '[verified officer-issued red-light demerits]'
      );
      text = replaceWhenNearby(
        text,
        /\bDecember\s+2,?\s+2024\b/gi,
        /\b(?:intersection\s+safety\s+devices?|speed-on-green|red\s+light\s+(?:enforcement|violations?))\b/i,
        '[verified speed-on-green removal date]'
      );
      break;
    case 'fight-stop-sign-ticket-alberta':
      // Official source: current Alberta Driver's Guide demerit schedule.
      text = text.replace(
        /\b(?:3|three)\s+demerit(?:s|\s+points?)\b/gi,
        '[verified stop-sign demerits]'
      );
      break;
    case 'speeding-ticket-alberta':
      // Primary sources: Traffic Safety Act s. 86 (court suspension), s. 172
      // (separate racing/bet-or-wager seizure power), and the current
      // Demerit Point Program and Service of Documents Regulation, Schedule 1.
      // Keep these admissions exact and contextual so an arbitrary suspension
      // duration or speed threshold elsewhere is still rejected.
      text = replaceWhenNearby(
        text,
        /\b(?:3|three)\s+months?\b/gi,
        /\b(?:court\s+may\s+order|court-ordered|on\s+conviction)\b[^.!?]{0,100}\b(?:licen[cs]e\s+)?suspension\b|\b(?:licen[cs]e\s+)?suspension\b[^.!?]{0,100}\b(?:court\s+may\s+order|court-ordered|on\s+conviction)\b/i,
        '[verified court suspension maximum]'
      );
      text = replaceWhenNearby(
        text,
        /\b51\s*km\/h\s+or\s+more\s+over(?:\s+the\s+limit)?\b/gi,
        /\b(?:court\s+appearance|six\s+(?:demerit\s+)?points?|court\s+may\s+order|automatic\s+roadside\s+suspension)\b/i,
        '[verified highest speeding band]'
      );
      text = replaceWhenNearby(
        text,
        /\b24[-\s]+hours?\b/gi,
        /\b(?:vehicle[-\s]+seizure|s\.?\s*172|racing|bet-or-wager)\b/i,
        '[verified separate seizure power]'
      );
      break;
    case 'photo-radar-ticket-edmonton':
      // Official sources: Alberta.ca "Photo radar in Alberta" and Edmonton automated enforcement.
      text = replaceWhenNearby(
        text,
        /\b(?:5|five)\s+minutes?\b/gi,
        /\b(?:same\s+vehicle|one\s+vehicle|multiple\s+(?:traffic\s+)?notices?|photo\s+radar\s+tickets?)\b/i,
        '[verified Edmonton notice interval]'
      );
      break;
    default:
      break;
  }
  return text;
}

function redactVerifiedNumericClaims(value, slug) {
  let text = redactReviewedPhotoRadarClaims(visibleText(value), slug);

  // Retain reviewed officer-page content when a new SKU extends the sitewide
  // ladder. Only the exact current-price statement qualifies, and it cannot
  // validate pricing on one of the three owner-notice guides.
  if (!PHOTO_RADAR_CONTENT_SLUGS.has(slug)) {
    text = text.split(OFFICER_PRICING_COPY).join('[verified officer offer pricing]');
  }

  // These are narrowly approved commercial facts from src/config/offers.json.
  // Remove only the exact complete statements before scanning for unsupported
  // legal numbers, so an arbitrary "48 hours" or partial price still fails.
  text = text
    .split(EXACT_FABSY_PRICING).join('[verified Fabsy offer pricing]')
    .split(CANONICAL_PRICE_RANGE_COPY).join('[verified Fabsy price range]')
    .split(RAPID_RESOLUTION_ONE_LINE).join('[verified Rapid Resolution summary]')
    .split(RAPID_RESOLUTION_ACTION_COMMITMENT).join('[verified Fabsy action commitment]')
    .split(RAPID_RESOLUTION_SPEED_DISCLAIMER).join('[verified Fabsy action boundary]');

  // Official source: current Alberta Driver's Guide speeding bands. Redact
  // both the point value and its matching speed threshold only when they
  // appear near one another, so unrelated numeric claims remain guarded.
  const speedingBands = [
    { points: '(?:2|two)', speed: '(?:up\\s+to\\s+)?15' },
    { points: '(?:3|three)', speed: '16\\s*(?:to|-)\\s*30' },
    { points: '(?:4|four)', speed: '31\\s*(?:to|-)\\s*50' },
    { points: '(?:6|six)', speed: '(?:51\\s*(?:km\\/h\\s*)?(?:or\\s+more)?|(?:more\\s+than|over)\\s*50)' },
  ];
  for (const band of speedingBands) {
    const completeBandPattern = new RegExp(
      `\\b${band.points}\\s+(?:demerits?|demerit\\s+points?|points?)\\b[^.!?]{0,70}\\b${band.speed}\\s*(?:km\\/h|kilometres?\\s+per\\s+hour)(?:\\s+over)?\\b`,
      'gi'
    );
    text = text.replace(completeBandPattern, '[verified complete speeding band]');
    const pointPattern = new RegExp(`\\b${band.points}\\s+(?:demerits?|demerit\\s+points?|points?)\\b`, 'gi');
    const speedPattern = new RegExp(`\\b${band.speed}\\s*(?:km\\/h|kilometres?\\s+per\\s+hour)(?:\\s+over)?\\b`, 'gi');
    const pointContext = new RegExp(`\\b${band.points}\\s+(?:demerits?|demerit\\s+points?|points?)\\b`, 'i');
    const speedContext = new RegExp(`\\b${band.speed}\\s*(?:km\\/h|kilometres?\\s+per\\s+hour)(?:\\s+over)?\\b`, 'i');
    text = replaceWhenNearby(text, pointPattern, speedContext, '[verified speeding demerit band]');
    text = replaceWhenNearby(text, speedPattern, pointContext, '[verified speeding threshold band]');
  }

  text = replaceWhenNearby(
    text,
    /\b(?:2|two)(?:\s+|-)years?\b/gi,
    /\b(?:demerit|points?|record|abstract|conviction)\b/i,
    '[verified demerit record period]'
  );

  text = replaceWhenNearby(
    text,
    /\b51\s*km\/h\s+or\s+more\s+over(?:\s+the\s+limit)?\b/gi,
    /\b(?:court\s+appearance|six\s+(?:demerit\s+)?points?)\b/i,
    '[verified mandatory court threshold]'
  );

  text = text.replace(
    /\b(?:2|two)\s+to\s+(?:6|six)\s+(?:demerits?|demerit\s+points?|points?)\b/gi,
    '[verified speeding demerit range]'
  );

  text = replaceWhenNearby(
    text,
    /\$\s*0\b/gi,
    /\b(?:(?:Free\s+)?Representation Eligibility Check|Free Ticket Review)\b/i,
    '[verified representation eligibility price]'
  );

  text = text
    .replace(/\b\d{1,3}\s*%\s+complete\b/gi, '[form progress]')
    .replace(/\b(?:last\s+)?(?:reviewed|sources?\s+checked):?\s*\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi, '[recorded source-check date]')
    .replace(/"dateModified"\s*:\s*"\d{4}-\d{2}-\d{2}"/gi, '"dateModified":"[recorded source-check date]"')
    .replace(/\bApril\s+1,?\s+2025\b/gi, '[verified photo radar date]')
    .replace(/\b(?:2|two)\s+to\s+(?:6|six)\s+demerit(?:s|\s+points?)\b/gi, '[verified speeding demerit range]')
    .replace(/\b(?:2|two)\s*(?:demerit(?:s|\s+points?))?\s*\(?\s*(?:for\s+)?(?:up\s+to\s+)?15\s*(?:km\/h\s*)?over\s*\)?/gi, '[verified speeding band]')
    .replace(/\b(?:3|three)\s*(?:demerit(?:s|\s+points?))?\s*(?:for\s+)?\(?\s*16\s*(?:to|-)\s*30(?:\s*km\/h)?(?:\s*over)?\s*\)?/gi, '[verified speeding band]')
    .replace(/\b(?:4|four)\s*(?:demerit(?:s|\s+points?))?\s*(?:for\s+)?\(?\s*31\s*(?:to|-)\s*50(?:\s*km\/h)?(?:\s*over)?\s*\)?/gi, '[verified speeding band]')
    .replace(/\b(?:6|six)\s*(?:demerit(?:s|\s+points?))?\s*(?:for\s+)?\(?\s*(?:more\s+than|over)\s*50(?:\s*km\/h)?(?:\s*over)?\s*\)?/gi, '[verified speeding band]')
    .replace(/\b(?:more\s+than\s+50|51\+)\s*(?:km\/h\s*)?over(?:\s+the\s+limit)?\s+(?:also\s+)?means?\s+a\s+mandatory\s+court\s+appearance\b/gi, '[verified mandatory court threshold]')
    .replace(/\b51\s*km\/h\s+or\s+more\s+over\s+the\s+limit[^.!?]{0,24}\b(?:requires?|means?)\s+a\s+(?:mandatory\s+)?court\s+appearance\b/gi, '[verified mandatory court threshold]')
    .replace(/\b(?:a\s+)?court\s+appearance\s+is\s+mandatory\s+for\s+speeding\s+at\s+51\s*km\/h\s+or\s+more\s+over\s+the\s+limit\b/gi, '[verified mandatory court threshold]')
    .replace(/\bfully\s+licen[cs]ed\s+drivers\s+face\s+suspension\s+at\s+15\s+demerits?\b/gi, '[verified full-licence suspension threshold]')
    .replace(/\b15\s+(?:demerits|points)\s+(?:for|on)\s+(?:a\s+)?full\s+licen[cs]es?\s*(?:and|or|,|\/)\s*8(?:\s+(?:demerits|points))?\s+(?:for|on)?\s*(?:a\s+)?GDL(?:\s+licen[cs]e)?\b/gi, '[verified suspension thresholds]')
    .replace(/\b15\s+(?:for|on)\s+(?:a\s+)?full\s+licen[cs]e\s*(?:and|or|,|\/)\s*8\s+(?:for|on)\s+(?:a\s+)?GDL\b/gi, '[verified suspension thresholds]');

  return redactSlugVerifiedFacts(text, slug);
}

function textGuardrailIssues(value, slug, options = {}) {
  const text = visibleText(redactReviewedFeeRefund(value, slug));
  const issues = [];
  if (options.marketing !== false) {
    const marketingText = text.replace(
      /\b(?:no|not|never|without|cannot|can't|do\s+not|does\s+not|is\s+not|isn't|are\s+not|aren't)\b[^.!?]{0,64}\bguarantee(?:d|s|ing)?\b/gi,
      '[negated claim]'
    );
    if (BANNED_PHRASE_RE.test(marketingText)) issues.push('banned phrase');
    if (text.includes('—')) issues.push('em dash');

    const pricingCandidate = redactReviewedPhotoRadarClaims(text, slug);
    if (
      hasFabsyPricingMarker(pricingCandidate) &&
      !hasCompleteFabsyPricing(text, slug) &&
      !(PHOTO_RADAR_OFFER_SLUGS.has(slug) && text.includes(PHOTO_RADAR_COMPLETE_PRICE))
    ) {
      issues.push('partial or inexact Fabsy pricing');
    }

    if (/\b(?:above|greater\s+than|in\s+excess\s+of|more\s+than|over)\s*(?:9[5-9]|100)\s*%\+?(?!\d)/i.test(text)) {
      issues.push('semantic outcome rate exceeds 95%');
    }
    if (UNSUPPORTED_OUTCOME_PREVALENCE_RE.test(text)) {
      issues.push('unsupported outcome prevalence claim');
    }
    if (UNSUPPORTED_APPEARANCE_PREVALENCE_RE.test(text)) {
      issues.push('unsupported appearance prevalence claim');
    }
  }

  if (options.numeric !== false) {
    const numericCandidate = redactVerifiedNumericClaims(text, slug);
    for (const [pattern, label] of UNSUPPORTED_NUMERIC_PATTERNS) {
      if (pattern.test(numericCandidate)) issues.push(label);
    }
  }
  return [...new Set(issues)];
}

function canonicalFaq(faqs) {
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

function curatedPageIssues(page) {
  const issues = [];
  const requiredFields = ['meta_title', 'meta_description', 'h1', 'hook', 'what', 'how', 'next'];
  for (const field of requiredFields) {
    if (!present(page?.[field])) issues.push(`missing ${field}`);
  }
  if (present(page?.meta_title) && page.meta_title.trim().length > 60) {
    issues.push('meta_title exceeds 60 characters');
  }
  if (present(page?.meta_description) && page.meta_description.trim().length > 155) {
    issues.push('meta_description exceeds 155 characters');
  }
  if (
    !Array.isArray(page?.bullets) ||
    page.bullets.length === 0 ||
    page.bullets.some((bullet) => !present(bullet))
  ) {
    issues.push('bullets must contain non-empty strings');
  }
  if (
    !Array.isArray(page?.faqs) ||
    page.faqs.length === 0 ||
    page.faqs.some((faq) => !present(faq?.q) || !present(faq?.a))
  ) {
    issues.push('FAQs must contain complete questions and answers');
  }
  if (page?.reviewed_at !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(page.reviewed_at)) {
    issues.push('reviewed_at must use YYYY-MM-DD');
  }
  if (page?.sources !== undefined) {
    if (!Array.isArray(page.sources) || page.sources.length === 0) {
      issues.push('sources must contain at least one source');
    } else {
      page.sources.forEach((source, index) => {
        if (!present(source?.title)) issues.push(`source ${index + 1}: missing title`);
        const provincialSource = /^https:\/\/(?:www\.)?(?:alberta\.ca|open\.alberta\.ca|traffictickets\.alberta\.ca|albertacourts\.ca|kings-printer\.alberta\.ca)\//i.test(source?.url || '');
        const reviewedPhotoRadarSource = PHOTO_RADAR_CONTENT_SLUGS.has(page?.slug) &&
          /^https:\/\/(?:www\.)?(?:edmonton\.ca|calgary\.ca|calgarypolice\.ca|calgarypolicecommission\.ca|newsroom\.calgary\.ca|kings-printer\.alberta\.ca|secure\.reddeer\.ca)\//i.test(source?.url || '');
        if (!provincialSource && !reviewedPhotoRadarSource) {
          issues.push(`source ${index + 1}: URL must be an official Alberta source`);
        }
      });
    }
  }

  const textFields = [
    ['meta_title', page?.meta_title],
    ['meta_description', page?.meta_description],
    ['h1', page?.h1],
    ['hook', page?.hook],
    ...(Array.isArray(page?.bullets)
      ? page.bullets.map((bullet, index) => [`bullet ${index + 1}`, bullet])
      : []),
    ...(Array.isArray(page?.faqs)
      ? page.faqs.flatMap((faq, index) => [
          [`FAQ ${index + 1} question`, faq?.q],
          [`FAQ ${index + 1} answer`, faq?.a],
        ])
      : []),
    ['what', page?.what],
    ['how', page?.how],
    ['next', page?.next],
  ];
  if (PHOTO_RADAR_CONTENT_SLUGS.has(page?.slug) &&
      !visibleText(page?.next).includes(PHOTO_RADAR_COMPLETE_PRICE)) {
    issues.push('next: complete Photo Radar pricing is required');
  }
  if (PHOTO_RADAR_CONTENT_SLUGS.has(page?.slug) && !String(page?.next ?? '').includes(PHOTO_REFUND_GUIDE_NOTICE)) {
    issues.push('next: complete reviewed Photo Radar fee-refund notice is required');
  }
  for (const [field, value] of textFields) {
    if (PHOTO_RADAR_CONTENT_SLUGS.has(page?.slug) && hasCompleteFabsyPricing(value)) {
      issues.push(`${field}: Photo Radar guides must use their own offer, not general product pricing`);
    }
    for (const issue of textGuardrailIssues(value, page?.slug)) issues.push(`${field}: ${issue}`);
  }

  for (const [field, html] of [['what', page?.what], ['how', page?.how], ['next', page?.next]]) {
    if (present(html) && UNSAFE_HTML_RE.test(html)) issues.push(`${field}: unsafe HTML`);
  }

  if (Array.isArray(page?.faqs) && page.faqs.every((faq) => present(faq?.q) && present(faq?.a))) {
    let stored = null;
    try {
      stored = typeof page.jsonld === 'string' ? JSON.parse(page.jsonld) : page.jsonld;
    } catch (_) {
      issues.push('jsonld is invalid JSON');
    }
    if (stored && JSON.stringify(stored) !== JSON.stringify(canonicalFaq(page.faqs))) {
      issues.push('FAQ jsonld does not exactly match visible FAQ text');
    }
  }

  return [...new Set(issues)];
}

module.exports = {
  BANNED_PHRASE_RE,
  EXACT_FABSY_PRICING,
  PHOTO_RADAR_COMPLETE_PRICE,
  PHOTO_REFUND_GUIDE_FAQ,
  PHOTO_REFUND_GUIDE_NOTICE,
  REVIEWED_REFUND_SOURCE_HASHES,
  REVIEWED_RAPID_REFUND_DISCLAIMER,
  UNSAFE_HTML_RE,
  canonicalFaq,
  curatedPageIssues,
  hasCompleteFabsyPricing,
  present,
  redactReviewedFeeRefund,
  redactVerifiedNumericClaims,
  textGuardrailIssues,
};
