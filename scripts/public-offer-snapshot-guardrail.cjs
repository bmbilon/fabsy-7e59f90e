/** Exact English public-offer admissions. This does not change article or locale policy. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const offers = require('../src/config/offers.json');
const photo = require('../src/config/photoRadarContent.json');
const fleet = require('../src/config/fleetContent.json');
const { publicContent, pricing, renderProDrivers } = require('./generate-pro-referral-snapshots.cjs');
const { renderPhotoRadar, renderFleet } = require('./generate-photo-radar-snapshots.cjs');
const { proDriverPromotionValues } = require('./pro-driver-promotion-guardrail.cjs');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROUTES = new Set(['/photo-radar', '/fleet', '/free-ticket-check', '/pro-drivers', '/refer']);
const MAIN_OFFER_CONTEXTS = {
  '/': ['src/components/AssessmentHomepageJourney.tsx', 'section[aria-labelledby="homepage-pricing-heading"]'],
  '/services': ['src/pages/Services.tsx', 'section[aria-labelledby="service-options-heading"]'],
  '/ai-info': ['src/pages/AIInfo.tsx', 'section[aria-labelledby="products-heading"]'],
};
const PHOTO_GUIDE_ROUTES = new Set(require('../src/config/photoRadarPages.json').map(slug => `/content/${slug}`));
// The owners froze these public copy files for this release. A changed source
// must receive a new explicit review of the admission contract and fixtures.
const SOURCE_HASHES = Object.freeze({
  'src/config/photoRadarPages.json': 'fefdefef911b906d3e42e871af6392a5d928a0ab66becdfaac23e3e832aa48f8',
  'src/config/photoRadarContent.json': '974b4c31f0dc4881e5b7d737ae5b3dbb1df6c6dbfaaf8c7c9f50aa48b360b01c',
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
    'No demerits', 'No insurance impact', 'No trial', 'No success fee', 'You approve any deal'];
  if (route === '/fleet') return [fleet.headline, fleet.accountPricing, offers.photoRadar.speedDisclaimer,
    'No demerits', 'No insurance impact', 'No success fee', 'You approve each Crown deal'];
  return ['Free Ticket Check', 'does not retain Fabsy', 'No payment is required'];
}

function publicCopy(route) {
  if (route === '/pro-drivers') return strings(publicContent.pro);
  if (route === '/refer') return strings(publicContent.referral);
  const priceLabel = `$${offers.photoRadar.priceCad} + 5% GST ($${offers.photoRadar.totalCad.toFixed(2)} total)`;
  if (route === '/photo-radar') return [...strings(photo), offers.photoRadar.actionCommitment, offers.photoRadar.speedDisclaimer,
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
    const wrappers = [element.textContent, `Already know it is an owner notice? ${element.textContent}.`, `Just one notice? ${element.textContent}.`, `${element.textContent} No demerits and no insurance impact.`];
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
  const scope = 'No demerits. No insurance impact. The only thing on the table is the fine. You approve any deal.';
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
        headerSource.includes("Start · $${activeOffer.priceCad}${photoContext ? ' + GST' : ''}")) {
      for (const link of document.querySelectorAll('header a')) {
        if (link.getAttribute('href') === offers.photoRadar.intakePath && safeElement(link) &&
            ['Start · $79 + GST', 'Start Photo Radar · $79 + GST'].some(copy => exact(link.textContent, copy))) {
          link.textContent = '[exact source-scoped owner-notice header CTA]';
        }
      }
    }
    const callBarSource = sourceText('src/components/CallBar.tsx');
    if (route === '/photo-radar' && callBarSource.includes('const photoContext = location.pathname === PHOTO_RADAR.slug;') &&
        callBarSource.includes("Start {photoContext ? 'Photo Radar' : 'Rapid Resolution'} · ${activeOffer.priceCad}{photoContext ? ' + GST' : ''}")) {
      for (const link of document.querySelectorAll('div.fixed.bottom-0 a')) {
        const block = link.parentElement;
        if (block.children.length !== 1 || !block.classList.contains('md:hidden') ||
            link.getAttribute('href') !== offers.photoRadar.intakePath || !exact(link.textContent, 'Start Photo Radar · $79 + GST') ||
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
    const description = '$79 + GST for Alberta notices mailed to a registered owner. No demerits, no insurance impact, no success fee.';
    const source = sourceText('src/pages/Services.tsx');
    if (!source.includes(`title: "${title}", description: "${description}"`)) return;
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
    'PRO_DRIVER_DISCOUNT_PERCENT': '20',
    '(PRO_DRIVER_RAPID_CENTS / 100).toFixed(2)': pricing.rapidPrice,
    '(PRO_DRIVER_BUNDLE_CENTS / 100).toFixed(2)': pricing.bundlePrice,
  };
  const source = sourceText('src/pages/TermsOfService.tsx', process.env.LOCALE_SOURCE_ROOT || ROOT).replace(/\{([^{}]+)\}/g,
    (original, expression) => substitutions[expression.trim()] ?? original);
  const rules = [
    ['5. Fees and Payment', null, [
      'Rapid Resolution: Photo Radar is $79 CAD plus 5% GST ($82.95 total)',
    ]],
    ['5C. Rapid Resolution: Photo Radar Terms', 'photo-radar-terms', [
      'Rapid Resolution: Photo Radar costs $79 CAD one-time, plus GST, charged at checkout. Fabsy pursues a resolution with the Crown; no outcome is promised and the fee is not refunded based on outcome.',
      offers.photoRadar.speedDisclaimer,
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

function redactPublicOfferSnapshot(html, { route }) {
  const original = String(html);
  const relevant = PUBLIC_ROUTES.has(route) || PHOTO_GUIDE_ROUTES.has(route) || route === '/terms-of-service' || route === '/services' || original.includes('Fabsy pricing ladder') || original.includes('20% off') || original.includes('Photo Radar ($79') || original.includes('Photo radar or red-light camera notice?');
  if (!relevant) return { html: original, issues: [] };
  const dom = new JSDOM(original);
  const document = dom.window.document;
  const issues = [];
  try {
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
    return { html: dom.serialize(), issues: [...new Set(issues)] };
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
