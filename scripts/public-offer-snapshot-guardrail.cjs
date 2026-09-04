/** Exact English public-offer admissions. This does not change article or locale policy. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const offers = require('../src/config/offers.json');
const photo = require('../src/config/photoRadarContent.json');
const feeRefund = require('../src/config/feeRefund.json');
const { PHOTO_REFUND_GUIDE_FAQ, PHOTO_REFUND_GUIDE_NOTICE, REVIEWED_REFUND_SOURCE_HASHES, REVIEWED_RAPID_REFUND_DISCLAIMER, redactReviewedFeeRefund } = require('./curated-content-guardrails.cjs');
const fleet = require('../src/config/fleetContent.json');
const { publicContent, pricing, renderProDrivers } = require('./generate-pro-referral-snapshots.cjs');
const { renderPhotoRadar, renderFleet } = require('./generate-photo-radar-snapshots.cjs');
const { proDriverPromotionValues } = require('./pro-driver-promotion-guardrail.cjs');
const { redactHomepageVisualSnapshot } = require('./homepage-visual-snapshot-guardrail.cjs');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROUTES = new Set(['/photo-radar', '/fleet', '/free-ticket-check', '/pro-drivers', '/refer']);
const MAIN_OFFER_CONTEXTS = {
  '/': ['src/components/AssessmentHomepageJourney.tsx', 'section[aria-labelledby="homepage-pricing-heading"]'],
  '/services': ['src/pages/Services.tsx', 'section[aria-labelledby="service-options-heading"]'],
  '/ai-info': ['src/pages/AIInfo.tsx', 'section[aria-labelledby="products-heading"]'],
};
const PHOTO_GUIDE_ROUTES = new Set(require('../src/config/photoRadarPages.json').map(slug => `/content/${slug}`));
const REFUND_NOTICE_SOURCES = {
  '/': 'src/components/Hero.tsx', '/rapid-resolution': 'src/pages/RapidResolution.tsx',
  '/photo-radar': 'src/pages/PhotoRadar.tsx', '/pro-drivers': 'src/pages/ProDrivers.tsx',
  '/faq': 'src/pages/FAQ.tsx', '/terms-of-service': 'src/pages/TermsOfService.tsx',
  '/terms-of-purchase': 'src/pages/TermsOfPurchase.tsx',
};
const REVIEWED_PHOTO_OUTCOME_COPY = `${feeRefund.payment} ${feeRefund.photoCondition} No trial. No success fee. Government fines are separate.`;
const REVIEWED_RAPID_OUTCOME_COPY = REVIEWED_RAPID_REFUND_DISCLAIMER;
// The owners froze these public copy files for this release. A changed source
// must receive a new explicit review of the admission contract and fixtures.
const SOURCE_HASHES = Object.freeze({
  'src/config/photoRadarPages.json': 'fefdefef911b906d3e42e871af6392a5d928a0ab66becdfaac23e3e832aa48f8',
  ...REVIEWED_REFUND_SOURCE_HASHES,
  'src/config/fleetContent.json': '5652afcc1a158a70446dfdf2850ac289280ab4ad4d72c5c8be3fdb89853d2720',
  'src/config/proReferralContent.json': '44c9aca3a399fa5cef0d5d04eca14655ff271dfcf32f371487d95ed066c48449',
});
const key = value => String(value ?? '').replace(/\s+/g, '');
const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const exact = (left, right) => key(left) === key(right);
const PUBLIC_TITLES = {
  '/pro-drivers': [publicContent.pro.title],
  '/refer': [publicContent.referral.title],
  '/photo-radar': ['Photo Radar Ticket in Alberta? $79 + GST | Fabsy', 'Photo Radar & Red-Light Ticket Help Alberta | $79 | Fabsy'],
  '/fleet': ['Alberta Fleet Photo Radar Help | $79 per Ticket | Fabsy'],
  '/free-ticket-check': ['Free Alberta Ticket Check | Fabsy'],
};
const sourceText = (relative, sourceRoot = ROOT) => fs.existsSync(path.join(sourceRoot, relative)) ? fs.readFileSync(path.join(sourceRoot, relative), 'utf8').replace(/\s+/g, ' ') : '';
const safeElement = element => !element.querySelector('script,style,template,noscript,iframe,object,input,form,[hidden],[aria-hidden="true"]') &&
  !/\son\w+\s*=|javascript\s*:|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(element.outerHTML);

function assertPublicOfferSources() {
  for (const [relative, expected] of Object.entries(SOURCE_HASHES)) {
    if (crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex') !== expected) {
      throw new Error(`Public offer copy changed without updating its reviewed contract: ${relative}`);
    }
  }
  proDriverPromotionValues(offers);
  const p = offers.photoRadar;
  if (p?.name !== 'Rapid Resolution: Photo Radar' || p.priceCad !== 79 || p.priceCents !== 7900 ||
      p.gstRate !== 0.05 || p.gstCad !== 3.95 || p.gstCents !== 395 || p.totalCad !== 82.95 || p.totalCents !== 8295 ||
      p.currency !== 'CAD' || p.intakePath !== '/submit-ticket?ticket_type=photo_radar' || p.slug !== '/photo-radar' ||
      p.actionCommitmentHours !== 48 || p.reviewPath !== 'ate' || p.orderType !== 'photo_radar') {
    throw new Error('Photo Radar must retain the authorized owner-notice $79 CAD plus 5% GST contract');
  }
}
assertPublicOfferSources();

function requiredCopy(route) {
  if (route === '/pro-drivers') return [publicContent.pro.heading, publicContent.pro.scope, publicContent.pro.exclusions,
    publicContent.pro.unverifiedText, publicContent.pro.outcomeDisclaimer];
  if (route === '/refer') return [publicContent.referral.heading, publicContent.referral.scope,
    publicContent.referral.termsEffective, ...publicContent.referral.rules.map(rule => rule.text)];
  if (route === '/photo-radar') return ['Photo radar ticket in the mail? $79 flat.', offers.photoRadar.speedDisclaimer,
    offers.photoRadar.insuranceDisclaimer, 'No trial', 'No success surcharge', 'You approve any deal'];
  if (route === '/fleet') return [fleet.headline, fleet.accountPricing, offers.photoRadar.speedDisclaimer,
    offers.photoRadar.insuranceDisclaimer, 'No success fee', 'You approve each Crown deal'];
  return ['Free Ticket Check', 'does not retain Fabsy', 'No payment is required', offers.photoRadar.insuranceDisclaimer];
}

function publicCopy(route) {
  if (route === '/pro-drivers') return strings(publicContent.pro);
  if (route === '/refer') return strings(publicContent.referral);
  const priceLabel = `$${offers.photoRadar.priceCad} + 5% GST ($${offers.photoRadar.totalCad.toFixed(2)} total)`;
  if (route === '/photo-radar') return [...strings(photo), offers.photoRadar.actionCommitment, offers.photoRadar.speedDisclaimer,
    ...(offers.photoRadar.outcomeDisclaimer === REVIEWED_PHOTO_OUTCOME_COPY ? [REVIEWED_PHOTO_OUTCOME_COPY] : []),
    'Photo radar ticket in the mail? $79 flat.',
    'Fabsy action within 48 hours after complete disclosure',
    `${offers.photoRadar.speedDisclaimer} A disclosure request does not itself extend a response or court deadline.`,
    `${priceLabel}. You approve any deal.`,
    'Official sources checked August 31, 2026',
    'One intake, all your plates. $79 + GST per ticket, account pricing at 5+ per month, monthly QuickBooks invoicing by arrangement.'];
  if (route === '/fleet') return [...strings(fleet), offers.photoRadar.speedDisclaimer, '5+ tickets a month?'];
  return [];
}

function replaceWholeBlocks(root, allowed) {
  const admitted = new Set(allowed.map(key));
  for (const element of Array.from(root.querySelectorAll('p,li,h1,h2,h3,h4,div')).reverse()) {
    if (!element.isConnected || element.querySelector('p,li,h1,h2,h3,h4,section,article,div,ul,ol,details') || !safeElement(element)) continue;
    if (admitted.has(key(element.textContent))) element.textContent = '[exact public source clause]';
  }
}

function safeRefundElement(element, icons = 0) {
  if (element.closest('[hidden],[aria-hidden="true"]')) return false;
  const safe = element.cloneNode(true);
  const decorative = Array.from(safe.querySelectorAll('svg[aria-hidden="true"]'));
  if (decorative.length !== icons || decorative.some(icon => icon.textContent.trim() || icon.querySelector('script,style,foreignObject,text,title,desc,a,image'))) return false;
  for (const icon of decorative) icon.remove();
  return safeElement(safe);
}

function safeRefundNotice(element, icons = 0) {
  if (!safeRefundElement(element, icons)) return false;
  const safe = element.cloneNode(true);
  for (const icon of safe.querySelectorAll('svg')) icon.remove();
  const attributes = {
    ASIDE: ['class', 'data-fee-refund-notice'], SECTION: ['class', 'aria-labelledby'],
    DIV: ['class'], H2: ['class', 'id'], P: ['class', 'lang', 'dir'], A: ['class', 'href', 'target', 'rel'],
  };
  // Component admission must not erase a new claim in an accessibility label
  // or an added element merely because its visible text still looks familiar.
  return [safe, ...safe.querySelectorAll('*')].every(node =>
    attributes[node.tagName] && Array.from(node.attributes).every(attribute => attributes[node.tagName].includes(attribute.name)));
}

function redactExactRefundNotices(document, route, issues) {
  const sourceFile = REFUND_NOTICE_SOURCES[route];
  const source = sourceFile && sourceText(sourceFile);
  const component = sourceText('src/components/FeeRefundNotice.tsx');
  const photoNotice = route === '/photo-radar';
  const headline = photoNotice ? feeRefund.photoHeadline : feeRefund.headline;
  const condition = photoNotice ? feeRefund.photoCondition : feeRefund.condition;
  const marker = photoNotice ? 'photo-radar' : 'ticket-representation';
  const copies = [headline, condition, feeRefund.declinedOfferText, feeRefund.payment, feeRefund.details];
  if (source?.includes('<FeeRefundNotice') && component.includes('to={FEE_REFUND.termsPath}') &&
      ['{copy(photoRadar ? "photoHeadline" : "headline")}', '{copy(photoRadar ? "photoCondition" : "condition")}', '{FEE_REFUND.declinedOfferText}', '{copy("payment")}', '{copy("details")}'].every(value => component.includes(value))) {
    const notices = Array.from(document.querySelectorAll('main aside[data-fee-refund-notice]'));
    if (notices.length > 1) issues.push('Fee-refund notice is duplicated');
    for (const notice of notices) {
      const generatedChildren = Array.from(notice.children);
      const generatedLink = generatedChildren[4]?.querySelector('a');
      if (route === '/pro-drivers' && sourceText('scripts/generate-pro-referral-snapshots.cjs').includes('<aside data-fee-refund-notice="ticket-representation"><h2>${esc(feeRefund.headline)}</h2>') &&
          notice.getAttribute('data-fee-refund-notice') === marker && generatedChildren.length === 5 &&
          generatedChildren.map(child => child.tagName).join(',') === 'H2,P,P,P,P' &&
          generatedChildren.slice(0, 4).every((child, index) => !child.children.length && exact(child.textContent, copies[index])) &&
          generatedChildren[2].getAttribute('lang') === 'en' && generatedChildren[2].getAttribute('dir') === 'ltr' &&
          generatedChildren[4].children.length === 1 && generatedLink && !generatedLink.children.length &&
          generatedLink.getAttribute('href') === feeRefund.termsPath && exact(generatedChildren[4].textContent, feeRefund.details) &&
          exact(notice.textContent, copies.join('')) && safeRefundNotice(notice)) {
        notice.textContent = '[exact source-scoped generated fee-refund notice]';
        continue;
      }
      const fields = Array.from(notice.querySelectorAll('h2,p,a'));
      const exactEnglishTemplate = route === '/terms-of-service' && notice.closest('main')?.getAttribute('data-fabsy-locale') === 'en' &&
        sourceText('scripts/generate-localized-snapshots.mjs').includes('<aside data-fee-refund-notice="ticket-representation"><h2>${esc(translate(\'feeRefund.headline\'))}</h2>') &&
        notice.children.length === 5 && Array.from(notice.children).map(child => child.tagName).join(',') === 'H2,P,P,P,A';
      if (notice.getAttribute('data-fee-refund-notice') !== marker || fields.length !== 5 ||
          fields.some((field, index) => field.children.length || !exact(field.textContent, copies[index])) ||
          fields.map(field => field.tagName).join(',') !== 'H2,P,P,P,A' || fields[4].getAttribute('href') !== feeRefund.termsPath ||
          fields[2].getAttribute('lang') !== 'en' || fields[2].getAttribute('dir') !== 'ltr' ||
          !exact(notice.textContent, copies.join('')) || !safeRefundNotice(notice, exactEnglishTemplate ? 0 : 1)) {
        issues.push('Fee-refund notice must retain its exact promise, Crown trigger, declined-offer clarification, payment disclosure and terms link');
        continue;
      }
      notice.textContent = '[exact source-scoped fee-refund notice]';
      if (exactEnglishTemplate && notice.parentElement.id === 'fee-refund-guarantee' &&
          sourceText('scripts/generate-localized-snapshots.mjs').includes("${p('feeRefund.scope')}")) {
        const scope = notice.nextElementSibling;
        if (scope?.tagName === 'P' && !scope.children.length && safeRefundElement(scope) && exact(scope.textContent, feeRefund.scope)) {
          scope.textContent = '[exact source-scoped fee-refund scope]';
        }
      }
    }
  }
  if (route === '/photo-radar' && sourceText('scripts/generate-photo-radar-snapshots.cjs').includes('aria-labelledby="photo-fee-refund-heading"')) {
    for (const notice of document.querySelectorAll('main section[aria-labelledby="photo-fee-refund-heading"]')) {
      const children = Array.from(notice.children);
      const link = children[4]?.querySelector('a');
      if (children.length !== 5 || children.map(child => child.tagName).join(',') !== 'H2,P,P,P,P' ||
          children[0].id !== 'photo-fee-refund-heading' || children.slice(0, 4).some((child, index) => child.children.length || !exact(child.textContent, copies[index])) ||
          children[2].getAttribute('lang') !== 'en' || children[2].getAttribute('dir') !== 'ltr' ||
          children[4].children.length !== 1 || !link || link.children.length || link.getAttribute('href') !== feeRefund.termsPath ||
          !exact(children[4].textContent, feeRefund.details) || !exact(notice.textContent, copies.join('')) || !safeRefundNotice(notice)) {
        issues.push('Photo Radar snapshot must retain its complete exact fee-refund notice');
        continue;
      }
      notice.textContent = '[exact source-scoped Photo Radar fee-refund notice]';
    }
  }
  if (PHOTO_GUIDE_ROUTES.has(route)) {
    const slug = route.slice('/content/'.length);
    const sourcePage = JSON.parse(fs.readFileSync(path.join(ROOT, `src/content/pages/${slug}.json`), 'utf8'));
    if (!sourcePage.next.includes(PHOTO_REFUND_GUIDE_NOTICE)) return;
    for (const heading of document.querySelectorAll('main h3')) {
      if (!exact(heading.textContent, feeRefund.photoHeadline)) continue;
      const conditionNode = heading.nextElementSibling;
      const paymentNode = conditionNode?.nextElementSibling;
      const termsNode = paymentNode?.nextElementSibling;
      const fields = [heading, conditionNode, paymentNode, termsNode];
      if (fields.some(field => !field || !safeRefundElement(field)) ||
          fields.map(field => field.tagName).join(',') !== 'H3,P,P,P' ||
          fields.slice(0, 3).some((field, index) => field.children.length || !exact(field.textContent, [feeRefund.photoHeadline, feeRefund.photoCondition, feeRefund.payment][index])) ||
          termsNode.children.length !== 1 || termsNode.firstElementChild.tagName !== 'A' || termsNode.firstElementChild.children.length ||
          termsNode.firstElementChild.getAttribute('href') !== feeRefund.termsPath || !exact(termsNode.textContent, `${feeRefund.details}.`)) {
        issues.push('Photo Radar guide must retain its complete exact fee-refund notice');
        continue;
      }
      for (const field of fields) field.textContent = '[exact source-scoped Photo Radar fee-refund clause]';
    }
    // The same complete Crown-trigger sentence is an approved source bullet.
    if (sourcePage.bullets.includes(feeRefund.photoCondition)) {
      for (const item of document.querySelectorAll('main li')) {
        if (!item.children.length && safeRefundElement(item) && exact(item.textContent, feeRefund.photoCondition)) item.textContent = '[exact Photo Radar fee-refund source bullet]';
      }
    }
  }
}

function redactExactRefundFaqs(document, route, issues) {
  let entries = [];
  if (route === '/photo-radar') entries = photo.faqs.filter(faq => faq.question === 'How does the Photo Radar fee refund guarantee work?');
  else if (PHOTO_GUIDE_ROUTES.has(route)) {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, `src/content/pages/${route.slice('/content/'.length)}.json`), 'utf8'));
    if (source.faqs.some(faq => faq.q === 'What does Fabsy charge to review a photo radar notice?' && faq.a === PHOTO_REFUND_GUIDE_FAQ)) {
      entries = [{ question: 'What does Fabsy charge to review a photo radar notice?', answer: PHOTO_REFUND_GUIDE_FAQ }];
    }
  } else if (route === '/rapid-resolution' && sourceText(REFUND_NOTICE_SOURCES[route]).includes('answer: `${FEE_REFUND.payment} ${FEE_REFUND.condition}`')) {
    entries = [{ question: 'Is a withdrawal or reduction promised?', answer: `${feeRefund.payment} ${feeRefund.condition}` }];
  } else if (route === '/faq' && sourceText(REFUND_NOTICE_SOURCES[route]).includes('a: `${FEE_REFUND.payment} ${FEE_REFUND.condition} A reduction in the fine, demerits, or both counts; a dismissal also improves the original penalty. Government fines are separate.`')) {
    entries = [{ question: 'Does Fabsy promise a particular result?', answer: `${feeRefund.payment} ${feeRefund.condition} A reduction in the fine, demerits, or both counts; a dismissal also improves the original penalty. Government fines are separate.` }];
    if (sourceText(REFUND_NOTICE_SOURCES[route]).includes('q: "Can I get a refund if I decline a reduced Crown offer?", a: FEE_REFUND.declinedOfferText')) {
      entries.push({ question: 'Can I get a refund if I decline a reduced Crown offer?', answer: feeRefund.declinedOfferText });
    }
  }
  if (!entries.length) return;
  // FAQSection's effect uses the same formatter as its visible answer. Only
  // this exact single plain paragraph is an alternate serialization on /faq.
  const paragraphAnswer = route === '/faq' && sourceText('src/components/FAQSchema.tsx').includes('const visibleAnswerHtml = faqAnswerHtml(f.a);') &&
    sourceText('src/components/FAQSection.tsx').includes('dangerouslySetInnerHTML={{ __html: faqAnswerHtml(faq.a) }}');
  const answerMatches = (actual, expected) => actual === expected || (paragraphAnswer && actual === `<p>${expected.replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}</p>`);
  replaceWholeBlocks(document.querySelector('main') || document.createElement('main'), entries.flatMap(faq => [faq.question, faq.answer]));
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let schema;
    try { schema = JSON.parse(script.textContent); } catch (_) { continue; }
    if (schema?.['@type'] !== 'FAQPage' || !Array.isArray(schema.mainEntity)) continue;
    for (const question of schema.mainEntity) {
      if (question?.['@type'] !== 'Question' || question.acceptedAnswer?.['@type'] !== 'Answer') continue;
      if (entries.some(faq => question.name === faq.question && !answerMatches(question.acceptedAnswer.text, faq.answer))) {
        issues.push('Fee-refund FAQ schema must retain its exact source question and answer');
        continue;
      }
      if (!entries.some(faq => question.name === faq.question && answerMatches(question.acceptedAnswer.text, faq.answer))) continue;
      // Preserve every other property: an appended or unrelated schema claim
      // never inherits this one exact Question/Answer admission.
      question.name = '[exact source fee-refund question]';
      question.acceptedAnswer.text = '[exact source fee-refund answer]';
    }
    script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
  }
}

function redactNamedPriceCards(main, route, issues) {
  const approvedNodes = new Set();
  const rules = route === '/pro-drivers'
    ? [{ price: `$${pricing.rapidPrice} CAD + GST`, label: publicContent.pro.rapidLabel },
      { price: `$${pricing.bundlePrice} CAD + GST`, label: publicContent.pro.bundleLabel }]
    : route === '/refer' ? publicContent.referral.rewards.map(reward => ({ price: `$${reward.amount} CAD`, label: reward.label }))
      : route === '/photo-radar' ? [
        { price: '$79 CAD + GST', label: offers.photoRadar.name },
        { price: '$79 + 5% GST ($82.95 total)', label: offers.photoRadar.name },
      ] : route === '/fleet' ? [{ price: '$79 + GST per ticket', label: null }] : [];
  for (const rule of rules) {
    let admitted = 0;
    for (const element of main.querySelectorAll('p,div')) {
      if (element.querySelector('p,div,section,article') || !safeElement(element) || !exact(element.textContent, rule.price)) continue;
      const previous = element.previousElementSibling;
      const next = element.nextElementSibling;
      const paired = !rule.label || exact(previous?.textContent, rule.label) || exact(next?.textContent, rule.label) ||
        (route === '/photo-radar' && exact(previous?.textContent, '$79 CAD + GST') && exact(previous?.previousElementSibling?.textContent, rule.label));
      if (!paired) continue;
      // Mark after collecting pairs so the adjacent tax breakdown can still
      // prove that it belongs to the original named price card.
      approvedNodes.add(element);
      admitted += 1;
    }
    if (admitted > 1) issues.push('Public offer contains a duplicate standalone price card');
  }
  for (const element of approvedNodes) {
    element.textContent = '[exact named public offer amount]';
  }
}

function redactSourceLinks(document, route) {
  const main = document.querySelector('main');
  const allowed = route === '/photo-radar' ? ['Start Photo Radar · $79 + GST', 'Start for $79 + GST']
    : route === '/fleet' ? ['Start with Photo Radar · $79 + GST']
      : route === '/free-ticket-check' ? ['View Photo Radar · $79 + GST', 'Photo radar or red-light owner notice? $79 + GST.'] : [];
  for (const element of main?.querySelectorAll('a') || []) {
    if (!allowed.some(value => exact(element.textContent, value))) continue;
    if (![offers.photoRadar.intakePath, offers.photoRadar.slug].includes(element.getAttribute('href'))) continue;
    const parentText = element.parentElement.textContent;
    const wrappers = [element.textContent, `Already know it is an owner notice? ${element.textContent}.`, `Just one notice? ${element.textContent}.`, `${element.textContent} ${offers.photoRadar.insuranceDisclaimer}`];
    if (element.parentElement.tagName === 'P' && !wrappers.some(value => exact(parentText, value))) continue;
    element.textContent = '[exact public offer link]';
  }
}

function redactExactNavigation(document, route) {
  if (/^\/(?:pa|tl|zh-hans|zh-hant|ar|hi|es)(?:\/|$)/.test(route) || /^\/(?:portal|admin|r)(?:\/|$)/.test(route)) return;
  const proLabel = 'Class 1, 2 or 4 licence? 20% off';
  const proScope = 'Verified Alberta licence. Officer-issued tickets only.';
  const ladderSource = sourceText('src/components/PricingLadder.tsx') + sourceText('src/components/ProductLadder.tsx');
  const context = MAIN_OFFER_CONTEXTS[route];
  const mainContext = context && sourceText(context[0]).includes('<PricingLadder />') ? document.querySelector(context[1]) : null;
  const navigationRoots = [...document.querySelectorAll('footer,section[aria-labelledby="product-ladder-heading"]'), ...(mainContext ? [mainContext] : [])];
  if (offers.rapidResolution.outcomeDisclaimer === REVIEWED_RAPID_OUTCOME_COPY &&
      sourceText('src/components/ProductLadder.tsx').includes('{RAPID_RESOLUTION.speedDisclaimer} {RAPID_RESOLUTION.outcomeDisclaimer}')) {
    for (const paragraph of document.querySelectorAll('section[aria-labelledby="product-ladder-heading"] p')) {
      if (!paragraph.children.length && safeRefundElement(paragraph) &&
          exact(paragraph.textContent, `${offers.rapidResolution.speedDisclaimer} ${REVIEWED_RAPID_OUTCOME_COPY}`)) {
        paragraph.textContent = '[exact source-scoped action and fee-refund boundary]';
      }
    }
  }
  if (ladderSource.includes(proLabel) && ladderSource.includes(proScope)) {
    for (const element of navigationRoots.flatMap(root => Array.from(root.querySelectorAll('p')))) {
      const links = element.querySelectorAll('a');
      if (links.length === 1 && links[0].getAttribute('href') === '/pro-drivers' &&
          exact(links[0].textContent, proLabel) && exact(element.textContent, proLabel + proScope) && safeElement(element)) {
        element.textContent = '[exact qualified Pro Driver navigation]';
      }
    }
  }
  const footer = sourceText('src/components/Footer.tsx');
  for (const link of document.querySelectorAll('footer a')) {
    const text = link.textContent;
    if (link.getAttribute('href') === '/photo-radar' && exact(text, 'Photo Radar ($79 + GST)') &&
        footer.includes('Photo Radar ($${PHOTO_RADAR.priceCad} + GST)')) link.textContent = '[exact Photo Radar navigation]';
    const item = link.parentElement;
    const list = item.parentElement;
    const heading = list?.previousElementSibling;
    if (footer.includes('{ name: "Fee-refund guarantee", path: FEE_REFUND.termsPath }') && footer.includes('footerLinks.legal.map((link) => (') &&
        link.getAttribute('href') === feeRefund.termsPath && exact(text, 'Fee-refund guarantee') && !link.children.length &&
        Array.from(link.attributes).every(attribute => ['class', 'href'].includes(attribute.name)) &&
        item.tagName === 'LI' && !item.attributes.length && item.children.length === 1 && exact(item.textContent, text) &&
        list?.tagName === 'UL' && heading?.tagName === 'H3' && !heading.children.length && exact(heading.textContent, 'Legal') && safeRefundElement(item)) {
      link.textContent = '[exact source-scoped fee-refund terms navigation]';
    }
  }
  for (const element of navigationRoots.flatMap(root => Array.from(root.querySelectorAll('p[aria-label="Fabsy pricing ladder, paid prices in Canadian dollars plus GST"]')))) {
    const pairs = Array.from(element.querySelectorAll('a')).map(link => [key(link.textContent), link.getAttribute('href')]);
    const expected = [['Free Ticket Check', '/free-ticket-check'], ['Photo Radar $79', '/photo-radar'],
      ['Rapid Resolution $198', '/rapid-resolution'], ['Bundle $229', '/submit-ticket?bundle=1'], ['Trial representation quoted', '/contact']];
    const safe = element.cloneNode(true);
    for (const separator of safe.querySelectorAll('span[aria-hidden="true"]')) {
      if (!separator.children.length && exact(separator.textContent, '/')) separator.remove();
    }
    if (safeElement(safe) && JSON.stringify(pairs) === JSON.stringify(expected.map(([text, href]) => [key(text), href])) &&
        exact(element.textContent, expected.map(([text]) => text).join('/'))) element.textContent = '[exact public pricing ladder]';
  }
  if (PUBLIC_ROUTES.has(route)) {
    replaceWholeBlocks(document.querySelector('footer') || document.createElement('footer'), [
      'Free Ticket Check / Photo Radar $79 / Rapid Resolution $198 / Bundle $229 / Trial representation quoted. Paid prices are CAD plus GST. Government fines are separate.',
    ]);
  }
}

function redactExactPhotoStrip(document, route) {
  const context = MAIN_OFFER_CONTEXTS[route];
  const root = context && sourceText(context[0]).includes('<PhotoRadarOfferStrip />')
    ? document.querySelector(context[1])
    : PHOTO_GUIDE_ROUTES.has(route) && sourceText('src/pages/WorkingContentPage.tsx').includes('<PhotoRadarOfferStrip />')
      ? document.querySelector('main') : null;
  if (!root) return;
  const caption = 'Photo radar or red-light camera notice? $79 + GST, no success fee.';
  const scope = 'The current demerit schedule assigns no points to an owner conviction under TSA s.160. Insurer treatment is not promised. You approve any deal.';
  const source = sourceText('src/components/PhotoRadarOfferStrip.tsx');
  if (!source.includes('Photo radar or red-light camera notice? ${PHOTO_RADAR.priceCad} + GST, no success fee.') ||
      !source.includes(scope) || !source.includes('to={PHOTO_RADAR.slug}')) return;
  for (const link of root.querySelectorAll('a[href="/photo-radar"]')) {
    const block = link.parentElement;
    const children = Array.from(block.children);
    if (block.tagName !== 'DIV' || children.length !== 2 || children[0] !== link || children[1].tagName !== 'P' ||
        link.querySelectorAll('a').length || !exact(link.textContent, caption + 'Check eligibility') ||
        !exact(children[1].textContent, scope) || !exact(block.textContent, caption + 'Check eligibility' + scope)) continue;
    // Only the component's two empty decorative SVGs may be hidden. A hidden
    // claim, appended sentence, alternate link or changed price is not admitted.
    const safe = block.cloneNode(true);
    const icons = Array.from(safe.querySelectorAll('svg[aria-hidden="true"]'));
    if (icons.length !== 2 || icons.some(icon => icon.textContent.trim() || icon.querySelector('script,style,foreignObject,text,title,desc,a,image'))) continue;
    for (const icon of icons) icon.remove();
    if (!safeElement(safe)) continue;
    block.textContent = '[exact source-scoped Photo Radar offer strip]';
  }
}

function redactExactPhotoControls(document, route) {
  if (route === '/photo-radar' || PHOTO_GUIDE_ROUTES.has(route)) {
    const headerSource = sourceText('src/components/Header.tsx');
    if (headerSource.includes('const activeOffer = photoContext ? PHOTO_RADAR : RAPID_RESOLUTION;') &&
        headerSource.includes('const activePriceLabel = `$${activeOffer.priceCad} CAD + GST`;') &&
        headerSource.includes('`Start · ${activePriceLabel}`')) {
      for (const link of document.querySelectorAll('header a')) {
        if (link.getAttribute('href') === offers.photoRadar.intakePath && safeElement(link) &&
            ['Start · $79 CAD + GST', 'Start online · $79 CAD + GST'].some(copy => exact(link.textContent, copy))) {
          link.textContent = '[exact source-scoped owner-notice header CTA]';
        }
      }
    }
    const callBarSource = sourceText('src/components/CallBar.tsx');
    if (route === '/photo-radar' && callBarSource.includes('const photoContext = location.pathname === PHOTO_RADAR.slug;') &&
        callBarSource.includes('const priceLabel = `$${activeOffer.priceCad} CAD + GST`;') &&
        callBarSource.includes('Start online · {priceLabel}')) {
      for (const link of document.querySelectorAll('div.fixed.bottom-0 a')) {
        const block = link.parentElement;
        if (block.children.length !== 1 || !block.classList.contains('md:hidden') ||
            link.getAttribute('href') !== offers.photoRadar.intakePath || !exact(link.textContent, 'Start online · $79 CAD + GST') ||
            !exact(block.textContent, link.textContent)) continue;
        const safe = link.cloneNode(true);
        const icons = Array.from(safe.querySelectorAll('svg[aria-hidden="true"]'));
        if (icons.length !== 1 || icons[0].textContent.trim() || icons[0].querySelector('script,style,foreignObject,text,title,desc,a,image')) continue;
        icons[0].remove();
        if (safeElement(safe)) link.textContent = '[exact source-scoped owner-notice mobile CTA]';
      }
    }
  }
  if (route === '/services') {
    const title = 'Photo radar and red-light cameras';
    const description = `$79 + GST for Alberta notices mailed to a registered owner. ${offers.photoRadar.insuranceDisclaimer} No success fee.`;
    const source = sourceText('src/pages/Services.tsx');
    if (!source.includes(`title: "${title}", description: \`$79 + GST for Alberta notices mailed to a registered owner. \${PHOTO_RADAR.insuranceDisclaimer} No success fee.\``)) return;
    for (const paragraph of document.querySelectorAll('section[aria-labelledby="ticket-types-heading"] p')) {
      const heading = paragraph.previousElementSibling;
      if (heading?.tagName === 'H3' && !heading.children.length && exact(heading.textContent, title) &&
          !paragraph.children.length && safeElement(paragraph) && exact(paragraph.textContent, description)) {
        paragraph.textContent = '[exact source-scoped owner-notice service card]';
      }
    }
  }
}

function redactTermsAdditions(document) {
  const substitutions = {
    'PHOTO_RADAR.priceCad': '79', 'PHOTO_RADAR.totalCad.toFixed(2)': '82.95',
    'PHOTO_RADAR.speedDisclaimer': offers.photoRadar.speedDisclaimer,
    'PHOTO_RADAR.insuranceDisclaimer': offers.photoRadar.insuranceDisclaimer,
    'PRO_DRIVER_DISCOUNT_PERCENT': '20',
    '(PRO_DRIVER_RAPID_CENTS / 100).toFixed(2)': pricing.rapidPrice,
    '(PRO_DRIVER_BUNDLE_CENTS / 100).toFixed(2)': pricing.bundlePrice,
    'FEE_REFUND.headline': feeRefund.headline, 'FEE_REFUND.payment': feeRefund.payment,
    'FEE_REFUND.condition': feeRefund.condition, 'FEE_REFUND.declinedOfferText': feeRefund.declinedOfferText, '" "': ' ',
  };
  const source = sourceText('src/pages/TermsOfService.tsx', process.env.LOCALE_SOURCE_ROOT || ROOT).replace(/\{([^{}]+)\}/g,
    (original, expression) => substitutions[expression.trim()] ?? original);
  const rules = [
    ['5. Fees and Payment', null, [
      'Rapid Resolution: Photo Radar is $79 CAD plus 5% GST ($82.95 total)',
    ]],
    ['5C. Rapid Resolution: Photo Radar Terms', 'photo-radar-terms', [
      'Rapid Resolution: Photo Radar costs $79 CAD one-time, plus GST, charged at checkout. Fabsy pursues a resolution with the Crown. No legal outcome is guaranteed; the fee-refund guarantee in section 5F applies.',
      offers.photoRadar.speedDisclaimer,
      offers.photoRadar.insuranceDisclaimer,
    ]],
    ['5D. Pro Driver Discount', 'pro-driver-terms', [
      "Holders of a verified Alberta Class 1, 2 or 4 driver's licence receive 20% off Rapid Resolution for an eligible officer-issued ticket: $158.40 CAD, or $183.20 CAD for the Rapid Resolution and insurance-planning bundle, in each case plus applicable GST.",
      'If verification is unavailable or inconclusive at checkout, the full price is charged. Use the secure post-checkout licence-upload process to request verification. If eligibility is confirmed, Fabsy refunds the 20% service discount and corresponding GST to the original payment method.',
    ]],
    ['5E. Refer a Driver Program', 'referral-terms', [
      'A past Fabsy client or registered portal user with a valid referral code may receive $50 CAD for an eligible officer-ticket referral or $20 CAD for an eligible camera-ticket referral. The reward is paid only to the referrer; the referred driver receives no referral discount. There is no cap on eligible referrals or rewards.',
      'A valid referral link or code must be recorded before payment. Attribution lasts 30 days. The most recent valid referral takes precedence; a code may also be entered at step 3 of intake.',
      "The referred driver's Stripe payment must settle and Fabsy must accept the Alberta matter into its service pipeline. The payout is due seven days after both conditions are met, subject to the eligibility, fraud, refund and payout-information checks below.",
      "Fabsy collects information needed for applicable tax reporting and issues required slips, including a T4A where applicable. The CRA's general annual threshold is more than $500 for reportable payments, subject to its rules and exceptions. Additional identifiers, if required, are requested through an appropriate secure process; do not send a SIN through referral messages or this profile form. You are responsible for reporting your income.",
    ]],
    ['5F. Fee-Refund Guarantee', 'fee-refund-guarantee', [
      feeRefund.headline, feeRefund.payment, feeRefund.condition, feeRefund.declinedOfferText,
      'A reduction in the fine, the number of demerits, or both counts as an improvement over the original ticket. A withdrawal or dismissal also improves the original penalty. No minimum reduction is required.',
      'Under the current demerit schedule, an owner conviction under Traffic Safety Act s.160 receives no demerit points, so the comparison is to the original fine only.',
      'The guarantee covers the service fee actually paid for Rapid Resolution, Rapid Resolution: Photo Radar, or the Rapid Resolution and insurance-planning bundle, including a discounted Pro Driver order. A standalone insurance report is not a ticket-representation service and is not covered by this outcome-based guarantee.',
      'The refund includes the corresponding GST. Any amount already refunded is deducted to avoid refunding the same payment twice. Work performed and payment-processing costs do not reduce a refund due under this guarantee.',
      "The 30-calendar-day period starts when Fabsy receives the Crown's rejection of Fabsy's efforts to obtain a lower original fine, fewer original demerits or withdrawal, and none of those improvements has been obtained. Payment or checkout does not start this clock. An opening or unchanged Crown offer before Fabsy's negotiation efforts have been rejected does not start it either.",
      'This is not a promise that the Crown will respond or the case will finish within 30 days. Once a qualifying rejection has been received, further negotiation or waiting for your instructions does not postpone the refund deadline.',
      'You do not have to accept a Crown offer or plead guilty to receive a refund due under this guarantee. Your case-specific instructions are still required for any resolution; ticket and court deadlines continue to apply.',
      "This is a promise about Fabsy's service fee, not a guarantee of a legal result. Government fines, court charges and third-party costs remain separate. The ordinary cancellation provisions below do not limit a refund due under this guarantee or any statutory rights.",
    ]],
    ['7. No Promised Result', null, [
      'Outcomes depend on the charge, evidence, procedure, prosecutor and court. Fabsy does not promise a withdrawal, reduced charge, lower fine, fewer demerits, premium saving, insurer eligibility or any other result. The 48-hour service commitment is not an outcome promise. The service-fee refund guarantee in section 5F applies independently of this limitation.',
    ]],
    ['10. Cancellation, Refunds and Termination', null, [
      'The fee-refund guarantee in section 5F is separate from cancellation. For other refunds, contact Fabsy promptly to request cancellation. Eligibility depends on the work already performed, third-party charges, the checkout disclosure and applicable law. If Fabsy declines an otherwise complete paid matter before substantive work begins, Fabsy will refund the applicable service fee. Statutory cancellation rights are not limited by these terms.',
    ]],
  ];
  for (const [heading, id, clauses] of rules) {
    const sourceBlocks = [...source.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map(match => match[0]);
    const authorizedSource = sourceBlocks.find(block => block.includes(heading) && (!id || block.includes(`id="${id}"`)));
    if (!authorizedSource) continue;
    const sections = Array.from(document.querySelectorAll('section')).filter(section =>
      exact(section.querySelector('h2')?.textContent, heading) && (!id || section.id === id));
    if (sections.length !== 1) continue;
    const sourceDom = JSDOM.fragment(authorizedSource);
    // Query separately: the installed DOM selector engine does not return
    // every union-selector match on a DocumentFragment.
    const sourceClauses = ['p', 'li'].flatMap(tag => Array.from(sourceDom.querySelectorAll(tag)))
      .filter(node => !node.children.length).map(node => node.textContent);
    const verified = clauses.filter(clause => sourceClauses.some(value => exact(value, clause)));
    if (id === 'fee-refund-guarantee' && (verified.length !== clauses.length ||
        !clauses.every(clause => Array.from(sections[0].querySelectorAll('p,li')).some(node =>
          !node.children.length && safeRefundElement(node) && exact(node.textContent, clause))))) continue;
    if (id === 'fee-refund-guarantee' && verified.length === clauses.length &&
        exact(sourceDom.querySelector('h2')?.textContent, heading) && safeRefundElement(sections[0].querySelector('h2'))) {
      sections[0].querySelector('h2').textContent = '[exact source-scoped fee-refund terms heading]';
    }
    // Only these complete plain-text elements within the matching original
    // section qualify. Inline additions, repeats elsewhere, and changed
    // amounts/eligibility/tax language stay visible to the normal checks.
    for (const node of sections[0].querySelectorAll('p,li')) {
      if (!node.children.length && verified.some(clause => exact(node.textContent, clause))) node.textContent = '[exact source-scoped additional terms]';
    }
  }
  const firstHeading = document.querySelector('h1');
  const updated = firstHeading?.nextElementSibling;
  if (exact(firstHeading?.textContent, 'Terms of Service') && updated?.tagName === 'P' && !updated.children.length &&
      exact(updated.textContent, 'Last updated: August 31, 2026') && source.includes('Last updated: August 31, 2026')) {
    updated.textContent = 'Last updated: [exact source date]';
  }
}

function redactRefundSourceClauses(document, route) {
  const photoPriceNote = 'Government fines are separate. The service fee is paid upfront and covered by our fee refund guarantee. See refund details.';
  const purchaseRefund = "The fee-refund guarantee applies when the Crown rejects Fabsy's efforts to reduce your original fine or demerits, or obtain a withdrawal, and none of those improvements has been obtained. Fabsy refunds the service fee you actually paid, together with the corresponding GST, within 30 calendar days of Fabsy receiving that rejection. Payment does not start the clock; an opening or unchanged offer before Fabsy's negotiation efforts have been rejected does not start it either. Photo radar and red-light owner notices are assessed on the original fine or withdrawal only. The guarantee covers Rapid Resolution, Photo Radar and the Rapid Resolution bundle, including discounted Pro Driver orders; it does not cover a standalone insurance report. Work already performed and payment-processing costs do not reduce a refund due under this guarantee. Amounts already refunded are not paid twice. Read the complete fee-refund terms.";
  const purchaseLimit = "Fabsy does not promise a withdrawal, reduced fine, fewer demerits, a particular court result, insurance savings, or any premium outcome. Courts, prosecutors, registries, and insurers make their own decisions. The fee-refund guarantee is a commitment to refund Fabsy's fee when its stated conditions are met, not a promise of a particular legal outcome.";
  const rules = route === '/photo-radar' ? [
    [photoPriceNote, 'p', 0, 'See refund details'],
    ['Read the full fee refund guarantee.', 'p', 0, 'Read the full fee refund guarantee'],
  ] : route === '/terms-of-purchase' ? [
    ['Rapid Resolution: Photo Radar costs $79 CAD plus 5% GST ($82.95 total), paid upfront for an accepted, eligible registered-owner camera notice. The fee-refund guarantee applies.', 'li', 1, null],
    [purchaseRefund, 'p', 0, 'complete fee-refund terms'],
    [purchaseLimit, 'p', 0, null],
  ] : [];
  if (rules.length) {
    const substitutions = { 'PHOTO_RADAR.name': offers.photoRadar.name, 'PHOTO_RADAR.priceCad': '79',
      'PHOTO_RADAR.totalCad.toFixed(2)': '82.95', '" "': ' ' };
    const source = sourceText(REFUND_NOTICE_SOURCES[route])
      .replaceAll('to={FEE_REFUND.termsPath}', `href="${feeRefund.termsPath}"`)
      .replace(/<Link\b/g, '<a').replace(/<\/Link>/g, '</a>')
      .replace(/\{([^{}]+)\}/g, (original, expression) => substitutions[expression.trim()] ?? original);
    const sourceClauses = [...source.matchAll(/<(p|li)\b[^>]*>[\s\S]*?<\/\1>/gi)].map(match => JSDOM.fragment(match[0]).textContent);
    for (const [clause, tag, icons, linkText] of rules) {
      if (!sourceClauses.some(value => exact(value, clause))) continue;
      for (const node of document.querySelectorAll(`main ${tag}`)) {
        const links = Array.from(node.querySelectorAll('a'));
        if (links.length !== (linkText ? 1 : 0) || (linkText && (links[0].getAttribute('href') !== feeRefund.termsPath || !exact(links[0].textContent, linkText)))) continue;
        if (exact(node.textContent, clause) && safeRefundElement(node, icons)) node.textContent = '[exact source-scoped fee-refund purchase clause]';
      }
    }
  }
  if (route === '/ai-info' && offers.rapidResolution.outcomeDisclaimer === REVIEWED_RAPID_OUTCOME_COPY && sourceText('src/pages/AIInfo.tsx').includes('RAPID_RESOLUTION.outcomeDisclaimer')) {
    for (const item of document.querySelectorAll('section[aria-labelledby="limits-heading"] li')) {
      if (exact(item.textContent, REVIEWED_RAPID_OUTCOME_COPY) && safeRefundElement(item, 1)) item.textContent = '[exact source-scoped fee-refund limit]';
    }
  }
}

function redactPublicOfferSnapshot(html, { route }) {
  const original = String(html);
  const relevant = PUBLIC_ROUTES.has(route) || PHOTO_GUIDE_ROUTES.has(route) || REFUND_NOTICE_SOURCES[route] || route === '/ai-info' || route === '/services' || original.includes('Fabsy pricing ladder') || original.includes('20% off') || original.includes('Photo Radar ($79') || original.includes('Photo radar or red-light camera notice?') || original.includes(REVIEWED_RAPID_OUTCOME_COPY) || original.includes('Fee-refund guarantee');
  if (!relevant) return { html: original, issues: [] };
  const dom = new JSDOM(original);
  const document = dom.window.document;
  const issues = [];
  try {
    redactHomepageVisualSnapshot(document, route, issues);
    redactExactRefundNotices(document, route, issues);
    redactExactRefundFaqs(document, route, issues);
    redactRefundSourceClauses(document, route);
    if (PUBLIC_ROUTES.has(route)) {
      if (document.querySelector('title')) {
        if (!PUBLIC_TITLES[route].includes(document.title)) issues.push('Public offer title differs from its exact source');
        else document.querySelector('title').textContent = '[exact public offer title]';
      }
      const mains = document.querySelectorAll('main');
      const main = mains[0];
      if (mains.length !== 1 || main?.querySelectorAll('h1').length !== 1) issues.push('Public offer must have one main and one heading');
      if (main) {
        const visible = main.cloneNode(true);
        for (const hidden of visible.querySelectorAll('script,style,template,noscript,[hidden],[aria-hidden="true"]')) hidden.remove();
        for (const copy of requiredCopy(route)) {
          if (!key(visible.textContent).includes(key(copy))) issues.push(`Public offer is missing its exact eligibility or scope: ${copy}`);
        }
        // Any missing qualification leaves every amount subject to the
        // original checks; the marker/route alone never grants admission.
        if (!issues.length) {
          redactNamedPriceCards(main, route, issues);
          redactSourceLinks(document, route);
          replaceWholeBlocks(main, publicCopy(route));
        }
      }
    }
    if (route === '/terms-of-service') redactTermsAdditions(document);
    redactExactPhotoStrip(document, route);
    redactExactPhotoControls(document, route);
    redactExactNavigation(document, route);
    const slug = route.startsWith('/content/') ? route.slice('/content/'.length) : route.replace(/^\//, '') || 'index';
    return { html: redactReviewedFeeRefund(dom.serialize(), slug), issues: [...new Set(issues)] };
  } finally { dom.window.close(); }
}

function normalizedJson(value) {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(name => [name, normalizedJson(value[name])]));
  return value;
}
const equalJson = (left, right) => JSON.stringify(normalizedJson(left)) === JSON.stringify(normalizedJson(right));
function schemas(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1]));
}
const generatedServices = new Map([
  ['/pro-drivers', schemas(renderProDrivers()).find(value => value['@type'] === 'Service')],
  ['/photo-radar', schemas(renderPhotoRadar()).find(value => value['@type'] === 'Service')],
  ['/fleet', schemas(renderFleet()).find(value => value['@type'] === 'Service')],
]);

function isExactPublicServiceSchema(value, route) {
  const generated = generatedServices.get(route);
  if (!generated || !value || value['@type'] !== 'Service') return false;
  if (equalJson(value, generated)) return true;
  if (route === '/pro-drivers') return false;
  const live = { ...generated, provider: { '@type': 'Organization', name: route === '/photo-radar' ? 'Fabsy' : 'Fabsy Traffic Ticket Services', url: 'https://fabsy.ca' } };
  live.offers = { '@type': 'Offer', price: '79', priceCurrency: 'CAD', url: generated.offers.url };
  if (route === '/photo-radar') {
    live.serviceType = 'Registered-owner automated traffic enforcement notice review';
    live.offers.availability = 'https://schema.org/InStock';
  } else live.offers.description = '$79 per ticket plus GST. Account pricing at 5+ per month is confirmed separately.';
  return equalJson(value, live);
}

function withoutExactPhotoCatalogOffer(value) {
  const catalog = value?.hasOfferCatalog;
  if (value?.['@type'] !== 'ProfessionalService' || value.name !== 'Fabsy Traffic Ticket Services' || value.url !== 'https://fabsy.ca' ||
      catalog?.['@type'] !== 'OfferCatalog' || catalog.name !== 'Fabsy Traffic Ticket Services' || !Array.isArray(catalog.itemListElement)) return value;
  const expected = {
    '@type': 'Offer', price: '79', priceCurrency: 'CAD', url: 'https://fabsy.ca/photo-radar',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: '79', priceCurrency: 'CAD', valueAddedTaxIncluded: false },
    itemOffered: { '@type': 'Service', name: 'Rapid Resolution: Photo Radar', description: 'Alberta automated enforcement owner notices under TSA 160(1). Not-guilty plea, disclosure and pursuit of a Crown reduction or withdrawal. No trial or success fee. The client approves any deal.' },
  };
  if (catalog.itemListElement.filter(item => equalJson(item, expected)).length !== 1) return value;
  return { ...value, hasOfferCatalog: { ...catalog, itemListElement: catalog.itemListElement.map(item =>
    equalJson(item, expected) ? { '@type': 'Offer', description: '[exact named Photo Radar catalog offer]' } : item) } };
}

module.exports = { PUBLIC_ROUTES, SOURCE_HASHES, assertPublicOfferSources, redactPublicOfferSnapshot, isExactPublicServiceSchema, withoutExactPhotoCatalogOffer };
