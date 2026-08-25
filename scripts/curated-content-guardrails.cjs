const EXACT_FABSY_PRICING =
  'Representation uses a $488 base representation fee plus 30% of any fine reduction achieved; there is no success fee if the fine is not reduced.';

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
    .replace(/&(?:nbsp|amp|quot|apos|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCompleteFabsyPricing(value) {
  const text = visibleText(value);
  return text.includes(EXACT_FABSY_PRICING);
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
  let text = visibleText(value);

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

  text = replaceWhenNearby(
    text,
    /\$\s*149\b/gi,
    /\b(?:Ticket Triage|Priority(?: Ticket)? Review|priority report|review deliverables|assessment|representation credit|already paid|can be applied)\b/i,
    '[verified assessment price]'
  );

  text = replaceWhenNearby(
    text,
    /\$\s*339\b/gi,
    /\b(?:base-fee balance|assessment credit|assessment payment)\b/i,
    '[verified assessment-credit balance]'
  );

  if (slug === 'traffic-ticket-assessment' || slug === 'index') {
    // Verified Fabsy product pricing. Keep this exemption narrowly scoped to
    // the assessment conversion routes so unrelated legal claims remain guarded.
    text = text
      .replace(/\$\s*149\b/gi, '[verified assessment price]')
      .replace(/\b149\s*CAD\b/gi, '[verified assessment price]')
      // These values appear only in the explicitly labelled illustrative
      // report example, not as claims about a real ticket or guaranteed result.
      .replace(/\$\s*500\s*[–-]\s*\$\s*1,000\b/gi, '[illustrative representation range]')
      .replace(/\$\s*1,200\s*[–-]\s*\$\s*2,400\b/gi, '[illustrative insurance range]')
      .replace(/\$\s*700\b/gi, '[illustrative break-even]')
      .replace(/\bSeptember\s+15,?\s+2026\b/gi, '[illustrative deadline]')
      .replace(/\b3\s+demerits?\b/gi, '[illustrative demerit exposure]')
      .replace(/\bthree\s+years?\b/gi, '[illustrative period]');
  }

  if (hasCompleteFabsyPricing(text)) {
    text = text
      .replace(/\$\s*488\b/gi, '[verified price]')
      .replace(/\b30\s*(?:%|percent)(?!\d)/gi, '[verified percentage]');
  }

  text = text
    .replace(/\b\d{1,3}\s*%\s+complete\b/gi, '[form progress]')
    .replace(/\b(?:last\s+)?reviewed:?\s*\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi, '[verified editorial review date]')
    .replace(/"dateModified"\s*:\s*"\d{4}-\d{2}-\d{2}"/gi, '"dateModified":"[verified editorial review date]"')
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
  const text = visibleText(value);
  const issues = [];
  if (options.marketing !== false) {
    const marketingText = text.replace(
      /\b(?:no|not|never|without|cannot|can't|do\s+not|does\s+not|is\s+not|isn't|are\s+not|aren't)\b[^.!?]{0,64}\bguarantee(?:d|s|ing)?\b/gi,
      '[negated claim]'
    );
    if (BANNED_PHRASE_RE.test(marketingText)) issues.push('banned phrase');
    if (text.includes('—')) issues.push('em dash');

    if (hasFabsyPricingMarker(text) && !hasCompleteFabsyPricing(text)) {
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
        if (!/^https:\/\/(?:www\.)?(?:alberta\.ca|open\.alberta\.ca|traffictickets\.alberta\.ca)\//i.test(source?.url || '')) {
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
  for (const [field, value] of textFields) {
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
  UNSAFE_HTML_RE,
  canonicalFaq,
  curatedPageIssues,
  hasCompleteFabsyPricing,
  present,
  redactVerifiedNumericClaims,
  textGuardrailIssues,
};
