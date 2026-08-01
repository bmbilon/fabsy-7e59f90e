export const EXACT_FABSY_PRICING =
  "Pricing is a flat $488 plus 30% of any fine reduction achieved; there is no additional charge if the fine is not reduced.";

const bannedPatterns: Array<[RegExp, string]> = [
  [/\bno[\s-]*win[\s,;-]+no[\s-]*fee\b/i, "no-win-no-fee wording"],
  [/\brisk[\s-]*free\b/i, "risk-free wording"],
  [/\bmoney[\s-]*back\b/i, "money-back wording"],
  [/\bguarantee(?:s|d|ing)?\b/i, "guarantee wording"],
  [/\bzero[\s-]*risk\b/i, "zero-risk wording"],
  [/—/, "em dash"],
];

const inexactPricingPatterns = [
  /\$\s*488\b/i,
  /\b30\s*(?:%|percent)\b.{0,80}\bfine\s+reduction\b/i,
  /\b(?:fabsy(?:'s)?|our)\s+(?:price|pricing|fee|fees|cost|costs|charge|charges)\b/i,
  /\b(?:we\s+(?:charge|cost)|fabsy\s+(?:charges|costs))\b/i,
  /\b(?:flat|base)\s+(?:fee|rate|price|charge)\b/i,
  /\b(?:contingency|success|outcome[\s-]*based|result[\s-]*based)\s+(?:price|pricing|fee|charge)\b/i,
  /\b(?:fee|charge|pricing)\s+(?:is\s+)?(?:contingent|based)\s+on\s+(?:success|the\s+outcome|the\s+result|a\s+reduction)\b/i,
  /\b(?:percentage|portion|share)\s+of\s+(?:the\s+)?(?:fine\s+reduction|savings?|amount\s+saved)\b/i,
];

const unsupportedLegalNumberPatterns: Array<[RegExp, string]> = [
  [/(?:CA\$|CAD\s*\$?)\s*\d[\d,.]*|\$\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:CAD|dollars?)\b/i, "unsupported monetary claim"],
  [/\b(?:fines?|penalt(?:y|ies)|surcharges?)\D{0,28}\d[\d,.]*(?:\.\d+)?\b/i, "unsupported fine or penalty number"],
  [/\b\d+(?:\.\d+)?\s*(?:demerits?|demerit\s+points?)\b|\b(?:demerits?|demerit\s+points?)\D{0,24}\d+(?:\.\d+)?\b/i, "unsupported demerit number"],
  [/\b(?:within|no\s+later\s+than|up\s+to|typically|usually)\s+\d{1,3}\s+(?:(?:business|calendar)\s+)?(?:days?|weeks?|months?)\b/i, "unsupported response period"],
  [/\b\d{1,3}[-\s](?:day|week|month)\s+(?:deadline|limit|window|period)\b|\b\d{1,3}\s+(?:days?|weeks?|months?)\s+to\s+(?:pay|respond|dispute|contest|file|appeal|request)\b/i, "unsupported response period"],
  [/\b(?:deadline|time\s+limit|response\s+period)\D{0,36}\d{1,4}\b/i, "unsupported deadline"],
  [/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b20\d{2}\b/i, "unsupported legal date"],
  [/\b\d+(?:\.\d+)?\s*(?:km\/h|kph)\b/i, "unsupported speed threshold"],
  [/\b(?:suspension|jail|imprisonment)\D{0,36}\d{1,3}\s*(?:days?|weeks?|months?|years?)\b/i, "unsupported penalty duration"],
  [/\b(?:insurance|premium|premiums)\D{0,60}\d+(?:\.\d+)?\s*(?:%|percent|times?|months?|years?)|\b\d+(?:\.\d+)?\s*(?:%|percent|times?|months?|years?)\D{0,60}\b(?:insurance|premium|premiums)\b/i, "unsupported insurance number"],
];

const lawyerStatusPattern =
  /\b(?:our|fabsy(?:'s)?)\s+(?:traffic\s+)?(?:lawyers?|attorneys?|legal\s+team)\b|\b(?:lawyers?|attorneys?)\s+(?:at|from)\s+fabsy\b|\bfabsy\s+(?:is|operates\s+as)\s+(?!not\b)(?:an?\s+)?law\s+firm\b|\b(?:fabsy|we)\s+(?:provides?|offers?)\s+legal\s+advice\b/i;

const collectStrings = (value: unknown, output: string[], seen: WeakSet<object>) => {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output, seen));
    return;
  }
  Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, output, seen));
};

const renderedText = (value: string): string =>
  value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]+/g, "")
    .replace(/^\s*(?:#{1,6}|>|[-+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

const addTextViolations = (value: string, violations: Set<string>) => {
  for (const [pattern, label] of bannedPatterns) {
    if (pattern.test(value)) violations.add(label);
  }

  if (/\b(?:for\s+women|women[\s-]*only|female\s+drivers?|women\s+drivers?|men\s+drivers?)\b/i.test(value)) {
    violations.add("gendered audience wording");
  }
  if (lawyerStatusPattern.test(value)) violations.add("lawyer-status claim");

  if (/\b(?:more\s+than|over|above|greater\s+than|in\s+excess\s+of)\s*(?:9[5-9]|100)%\+?(?!\d)/i.test(value)) {
    violations.add("outcome rate exceeds 95%");
  }
  for (const match of value.matchAll(/(\d{1,3})%\+?\s+(?:historical\s+)?(?:success|win|favourable|favorable)(?:\s+rate)?/gi)) {
    if (Number(match[1]) > 95) violations.add("outcome rate exceeds 95%");
  }
  for (const match of value.matchAll(/(?:success|win|favourable|favorable)(?:\s+rate)?[^\d]{0,16}(\d{1,3})%\+?/gi)) {
    if (Number(match[1]) > 95) violations.add("outcome rate exceeds 95%");
  }

  if (/\b(?:testimonials?|social\s+proof)\b/i.test(value)) {
    violations.add("unverified testimonial or social-proof claim");
  }
  if (/\b(?:most|many|nearly\s+all)\s+(?:cases|tickets|matters|disputes)\b.{0,80}\b(?:win|won|resolve[ds]?|reduce[ds]?|dismiss(?:ed)?|withdrawn|successful|favourable|favorable)\b/i.test(value)) {
    violations.add("unverified outcome-prevalence claim");
  }
  if (/\b\d+(?:\.\d+)?[ \t]+(?:stars?|reviews|ratings?)\b|\b(?:rated|rating)\D{0,20}\d+(?:\.\d+)?\b/i.test(value)) {
    violations.add("unverified rating or review claim");
  }

  const withoutApprovedPricing = value.split(EXACT_FABSY_PRICING).join(" ");
  if (inexactPricingPatterns.some((pattern) => pattern.test(withoutApprovedPricing))) {
    violations.add("inexact or partial Fabsy pricing");
  }
  for (const [pattern, label] of unsupportedLegalNumberPatterns) {
    if (pattern.test(withoutApprovedPricing)) violations.add(label);
  }
};

export const generatedContentViolations = (value: unknown): string[] => {
  const strings: string[] = [];
  collectStrings(value, strings, new WeakSet<object>());
  const violations = new Set<string>();

  for (const raw of strings) {
    addTextViolations(raw, violations);
    const rendered = renderedText(raw);
    if (rendered !== raw) addTextViolations(rendered, violations);
  }

  return [...violations];
};

export const assertGeneratedContentSafe = (value: unknown): void => {
  const violations = generatedContentViolations(value);
  if (violations.length) {
    throw new Error(`Generated content failed publication guardrails: ${violations.join("; ")}`);
  }
};
