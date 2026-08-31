/**
 * Exact admission for the reviewed English homepage presentation. The stronger
 * headline is allowed only with its visible policy, upfront price, Crown-rejection
 * trigger, declined-offer boundary and published terms link on the same page.
 * This is not a general exception for guarantees, prices or outcome claims.
 */
const fs = require('node:fs');
const path = require('node:path');
const offers = require('../src/config/offers.json');
const feeRefund = require('../src/config/feeRefund.json');

const ROOT = path.resolve(__dirname, '..');
const compact = value => String(value ?? '').replace(/\s+/g, '');
const qualification = 'We can’t guarantee a court outcome. Our guarantee covers the service fee you paid.';
const successDefinition = 'A reduction in the fine, the number of demerits, or both counts as an improvement over the original ticket. A withdrawal or dismissal also improves the original penalty. No minimum reduction is required.';
const refundScope = `${feeRefund.scope} The refund includes the corresponding GST. Any amount already refunded is deducted to avoid refunding the same payment twice. A standalone insurance report is not covered by this outcome-based guarantee. Trial representation, court charges and third-party costs are separate.`;
const heroHeading = 'We get your ticket reduced or thrown out, or you don’t pay.';
const price = `$${offers.rapidResolution.priceCad} CAD + GST · Paid upfront; refunded if the policy applies`;
const policyAnchor = '#money-back-guarantee';

const SOURCE_BINDINGS = {
  'src/pages/Index.tsx': ['<Hero />', '<HomepageOutcomeExplorer />', '<RapidResolutionGuarantee />', '<AssessmentHomepageJourney />'],
  'src/content/homepageRefundCopy.ts': ['refundCondition: FEE_REFUND.condition', 'declinedOfferDisclaimer: FEE_REFUND.declinedOfferText', 'paymentTiming: FEE_REFUND.payment', 'termsPath: FEE_REFUND.termsPath'],
  'src/components/Hero.tsx': ['aria-labelledby="homepage-hero-heading"', '{HOMEPAGE_REFUND_COPY.headline}', '{HOMEPAGE_REFUND_COPY.outcomeQualification}', '{HOMEPAGE_REFUND_COPY.refundCondition}', 'to={RAPID_RESOLUTION.intakePath}'],
  'src/components/RapidResolutionGuarantee.tsx': ['id="money-back-guarantee"', '{HOMEPAGE_REFUND_COPY.successDefinition}', '{HOMEPAGE_REFUND_COPY.declinedOfferDisclaimer}', '{HOMEPAGE_REFUND_COPY.refundCondition}', '{HOMEPAGE_REFUND_COPY.paymentTiming}', '{HOMEPAGE_REFUND_COPY.refundScope}', 'to={HOMEPAGE_REFUND_COPY.termsPath}'],
  'src/components/HomepageOutcomeExplorer.tsx': ['aria-labelledby="homepage-outcomes-heading"', '{HOMEPAGE_REFUND_COPY.declinedOfferDisclaimer}', '{HOMEPAGE_REFUND_COPY.outcomeQualification}'],
  'src/components/AssessmentHomepageJourney.tsx': ['aria-labelledby="homepage-pricing-heading"', '{RAPID_RESOLUTION.speedDisclaimer}', '<InsuranceContextSection />', '<ProDriverSection />', '<HomepageDriverSection />'],
  'src/components/HomepageDriverSection.tsx': ['aria-labelledby="homepage-driver-heading"', '{HOMEPAGE_REFUND_COPY.outcomeQualification}', 'to={RAPID_RESOLUTION.intakePath}'],
};

function sourceBindingsMatch() {
  return Object.entries(SOURCE_BINDINGS).every(([file, required]) => {
    const location = path.join(ROOT, file);
    if (!fs.existsSync(location)) return false;
    const source = fs.readFileSync(location, 'utf8');
    return required.every(clause => source.includes(clause));
  });
}

function hidden(element) {
  return element.hasAttribute('hidden') || element.hasAttribute('inert') || element.getAttribute('aria-hidden') === 'true' ||
    /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/i.test(element.getAttribute('style') || '') ||
    (element.tagName !== 'BR' && [...element.classList].some(name => /^(?:[\w-]+:)*(?:hidden|invisible|sr-only|opacity-0)$/.test(name)));
}

function visible(element) {
  for (let node = element; node; node = node.parentElement) if (hidden(node)) return false;
  return true;
}

function safeCopyField(element, links = []) {
  if (!visible(element)) return false;
  const copy = element.cloneNode(true);
  const svgAttributes = new Set(['xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'class', 'aria-hidden', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'points', 'rx', 'ry', 'transform']);
  for (const icon of copy.querySelectorAll('svg')) {
    if ((icon.hasAttribute('aria-hidden') && icon.getAttribute('aria-hidden') !== 'true') || icon.textContent.trim() ||
        icon.querySelector('script,style,foreignObject,text,title,desc,a,image') ||
        [icon, ...icon.querySelectorAll('*')].some(node => [...node.attributes].some(attribute => !svgAttributes.has(attribute.name)))) return false;
    icon.remove();
  }
  const attributes = {
    H1: ['class', 'id'], H2: ['class', 'id'], H3: ['class', 'id'], P: ['class', 'id'],
    SPAN: ['class'], STRONG: ['class'], BR: ['class'], A: ['class', 'href'],
    TD: ['class'], DIV: ['class'],
    BUTTON: ['class', 'type', 'id', 'aria-controls', 'aria-expanded', 'data-state', 'data-orientation', 'data-radix-collection-item'],
  };
  if (![copy, ...copy.querySelectorAll('*')].every(node => attributes[node.tagName] && !hidden(node) &&
      [...node.attributes].every(attribute => attributes[node.tagName].includes(attribute.name)))) return false;
  const actualLinks = [...(copy.tagName === 'A' ? [copy] : []), ...copy.querySelectorAll('a')];
  return actualLinks.length === links.length && actualLinks.every((link, index) =>
    link.getAttribute('href') === links[index][0] && compact(link.textContent) === compact(links[index][1]));
}

function redactHomepageVisualSnapshot(document, route, issues) {
  if (route !== '/') return;
  const present = document.querySelector('section[aria-labelledby="homepage-hero-heading"],section#money-back-guarantee') ||
    compact(document.body.textContent).includes(compact(heroHeading));
  // Older deterministic snapshots have their existing independent contract.
  if (!present) return;
  const initialIssueCount = issues.length;
  const redactions = new Set();
  if (!sourceBindingsMatch()) issues.push('Homepage presentation no longer matches its reviewed source bindings');
  const mains = document.querySelectorAll('main');
  if (mains.length !== 1) issues.push('Homepage presentation requires one main landmark');
  const main = mains[0] || document;
  function section(selector, label) {
    const nodes = [...main.querySelectorAll(selector)];
    if (nodes.length !== 1 || !visible(nodes[0])) {
      issues.push(`Homepage is missing its unique visible ${label}`);
      return document.createElement('section');
    }
    return nodes[0];
  }
  function field(root, selector, expected, label, links = [], required = true) {
    const nodes = [...root.querySelectorAll(selector)].filter(node => compact(node.textContent) === compact(expected));
    if ((!required && !nodes.length)) return;
    if (nodes.length !== 1 || !safeCopyField(nodes[0], links)) {
      issues.push(`Homepage must retain its exact visible ${label}`);
      return;
    }
    redactions.add(nodes[0]);
  }

  const hero = section('section[aria-labelledby="homepage-hero-heading"]', 'hero');
  const policy = section('section#money-back-guarantee[aria-labelledby="money-back-guarantee-heading"]', 'refund policy');
  const outcomes = section('section[aria-labelledby="homepage-outcomes-heading"]', 'outcome explanation');
  const driver = section('section[aria-labelledby="homepage-driver-heading"]', 'driver section');
  const pricing = section('section[aria-labelledby="homepage-pricing-heading"]', 'pricing section');
  const process = section('section[aria-labelledby="homepage-process-heading"]', 'service-clock context');
  for (const scope of [hero, policy, outcomes, driver, pricing, process]) {
    for (const node of [scope, ...scope.querySelectorAll('*')]) {
      for (const name of ['aria-label', 'aria-description', 'title', 'alt']) {
        if (/(?:guarantee|risk[\s-]*free|money[\s-]+back|\$\s*\d)/i.test(node.getAttribute(name) || '')) {
          issues.push('Homepage must not add an unreviewed accessibility or tooltip offer claim');
        }
      }
    }
  }

  field(hero, 'h1#homepage-hero-heading', heroHeading, 'reviewed hero headline');
  field(hero, 'p', 'Success guaranteed or your money back.', 'qualified supporting headline');
  field(hero, 'p', `${qualification} ${feeRefund.condition}`, 'hero outcome qualification and Crown-rejection trigger');
  field(hero, 'p', price, 'Rapid Resolution upfront price and GST');
  field(hero, 'p', 'For eligible Alberta pre-trial matters. Government fines and trial representation are separate. How the money-back guarantee works',
    'hero scope and policy destination', [[policyAnchor, 'How the money-back guarantee works']]);
  field(hero, 'a', 'Get help with my ticket', 'Rapid Resolution intake destination', [[offers.rapidResolution.intakePath, 'Get help with my ticket']]);

  field(policy, 'h2#money-back-guarantee-heading', 'A reduction, a withdrawal, or your fee back.', 'policy heading');
  field(policy, 'p', qualification, 'court-outcome qualification');
  field(policy, 'p', successDefinition, 'definition of an improvement');
  field(policy, 'p', feeRefund.declinedOfferText, 'declined-improving-offer boundary');
  field(policy, 'h3', 'No reduction? Refunded within 30 days.', 'refund-window heading');
  field(policy, 'p', feeRefund.condition, 'Crown-rejection refund trigger');
  field(policy, 'p', feeRefund.payment, 'upfront payment disclosure');
  field(policy, 'p', refundScope, 'full published product and fee scope');
  field(policy, 'a', 'Read the full money-back policy', 'published policy link', [[feeRefund.termsPath, 'Read the full money-back policy']]);

  field(outcomes, 'p#homepage-outcomes-context', 'For eligible officer-issued tickets. Illustrations only, not a prediction.', 'illustrative officer-ticket scope');
  field(outcomes, 'h3', 'We Negotiate. You Decide.', 'client-decision heading');
  field(outcomes, 'p', feeRefund.declinedOfferText, 'client-decision refund boundary');
  field(outcomes, 'p', `${qualification} Read the money-back policy.`, 'outcome policy qualification', [[policyAnchor, 'Read the money-back policy.']]);
  // Radix only mounts the selected illustration. A no-reduction panel must
  // retain the complete trigger if it is the panel captured by prerendering.
  if ([...outcomes.querySelectorAll('[role="tabpanel"]')].some(panel => panel.textContent.includes('No penalty reduction'))) {
    field(outcomes, 'p', 'After the Crown rejects Fabsy’s efforts and no reduction or withdrawal is obtained', 'no-reduction illustration condition');
    field(outcomes, 'p', feeRefund.condition, 'no-reduction illustration Crown-rejection clock');
    field(outcomes, 'td', 'Refunded within 30 days of receiving the rejection', 'illustrated refund timing');
  }

  field(driver, 'p', `${qualification} See the refund conditions and 30-day timing.`, 'driver-section qualification', [[policyAnchor, 'See the refund conditions and 30-day timing.']]);
  field(driver, 'p', price, 'driver-section upfront price and GST');
  field(driver, 'a', 'Start Rapid Resolution', 'driver-section intake destination', [[offers.rapidResolution.intakePath, 'Start Rapid Resolution']]);
  field(pricing, 'a', 'Service-fee money-back guarantee · See policy', 'Rapid Resolution policy link', [[policyAnchor, 'Service-fee money-back guarantee · See policy']]);
  field(pricing, 'a', 'Service-fee refund guarantee · See policy', 'bundle policy link', [[policyAnchor, 'Service-fee refund guarantee · See policy']]);

  const clock = process.querySelector('aside[aria-labelledby="homepage-speed-heading"]') || document.createElement('aside');
  field(clock, 'p', String(offers.rapidResolution.actionCommitmentHours), 'service-clock number');
  field(clock, 'p', 'hour action commitment', 'service-clock label');
  field(clock, 'p', offers.rapidResolution.speedDisclaimer, 'complete service-clock boundary');
  // Keep the complete disclaimer for the existing numeric guard, which uses
  // it to qualify the matching FAQ question. It has its own exact admission.
  for (const node of [...redactions]) if (compact(node.textContent) === compact(offers.rapidResolution.speedDisclaimer)) redactions.delete(node);

  const comparison = main.querySelector('section#fabsy-difference');
  if (comparison) {
    field(comparison, 'a', `See everything included for $${offers.rapidResolution.priceCad}`, 'comparison service-price link', [[offers.rapidResolution.slug, `See everything included for $${offers.rapidResolution.priceCad}`]]);
    field(comparison, 'p', 'CAD plus GST. Eligible pre-trial matters; trial separate.', 'comparison price scope');
  }

  const faq = main.querySelector('section[aria-labelledby="homepage-faq-heading"]');
  if (faq) {
    field(faq, 'button', 'When do I get my money back if there is no reduction?', 'refund FAQ question');
    // Expanded accordion answers must be complete plain fields. Closed
    // answers are unmounted, and never substitute for the visible policy.
    for (const answer of [
      `${qualification} ${successDefinition}`,
      `${feeRefund.condition} ${feeRefund.payment} ${refundScope}`,
      feeRefund.declinedOfferText,
    ]) field(faq, '[role="region"] > div', answer, 'expanded refund FAQ answer', [], false);
  }

  // Do not redact even valid fragments when any required context is missing.
  // Extra blocks/attributes remain in the snapshot for the global guards.
  if (issues.length === initialIssueCount) for (const node of redactions) node.textContent = '[exact source-scoped homepage presentation]';
}

module.exports = { redactHomepageVisualSnapshot };
